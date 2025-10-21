import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { getNextPollingDelay, getRandomStartupDelay } from '../util/jitter.js';
import { fetchRssContent, generateContentHash } from '../rss/fetch.js';
import { RssParser } from '../rss/parse.js';
import { MonPompierMapper } from '../rss/map_monpompier.js';
import { normalizeStatus, requiresPublicNotification, requiresDMNotification } from '../util/status.js';
import { DiscordBot } from '../discord/client.js';
import { createPublicNotificationEmbed, createDMNotificationEmbed } from '../discord/embeds.js';

export class PollingScheduler {
  private bot: DiscordBot;
  private parser: RssParser;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor(bot: DiscordBot) {
    this.bot = bot;
    this.parser = new RssParser();
  }

  /**
   * Démarre le scheduler pour tous les serveurs
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduler déjà en cours d\'exécution');
      return;
    }

    this.isRunning = true;
    logger.info('Démarrage du scheduler de polling RSS');

    try {
      // Récupérer tous les serveurs avec des véhicules
      const guilds = await prisma.vehicle.findMany({
        select: { guildId: true },
        distinct: ['guildId']
      });

      for (const { guildId } of guilds) {
        await this.startGuildPolling(guildId);
      }

      logger.info({ guildCount: guilds.length }, 'Scheduler démarré pour tous les serveurs');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Erreur lors du démarrage du scheduler');
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Arrête le scheduler
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Arrêt du scheduler de polling RSS');

    // Arrêter tous les intervalles
    for (const [guildId, interval] of this.intervals) {
      clearInterval(interval);
      logger.debug({ guildId }, 'Polling arrêté pour le serveur');
    }

    this.intervals.clear();
    this.isRunning = false;

    logger.info('Scheduler arrêté');
  }

  /**
   * Démarre le polling pour un serveur spécifique
   */
  public async startGuildPolling(guildId: string): Promise<void> {
    try {
      // Récupérer la configuration du serveur
      const config = await prisma.guildConfig.findUnique({
        where: { guildId }
      });

      const pollingSec = config?.pollingSec || 120;

      // Arrêter l'intervalle existant s'il y en a un
      if (this.intervals.has(guildId)) {
        clearInterval(this.intervals.get(guildId)!);
      }

      // Délai de démarrage aléatoire pour éviter la synchronisation
      const startupDelay = getRandomStartupDelay(30000);
      
      setTimeout(() => {
        this.pollGuild(guildId);
        
        // Programmer le polling suivant
        const nextDelay = getNextPollingDelay(pollingSec);
        const interval = setInterval(() => {
          this.pollGuild(guildId);
        }, nextDelay);

        this.intervals.set(guildId, interval);
        logger.info({ guildId, pollingSec, startupDelay }, 'Polling démarré pour le serveur');
      }, startupDelay);

    } catch (error) {
      logger.error({ guildId, error: error instanceof Error ? error.message : String(error) }, 'Erreur lors du démarrage du polling');
    }
  }

  /**
   * Arrête le polling pour un serveur spécifique
   */
  public stopGuildPolling(guildId: string): void {
    const interval = this.intervals.get(guildId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(guildId);
      logger.info({ guildId }, 'Polling arrêté pour le serveur');
    }
  }

  /**
   * Effectue le polling pour un serveur
   */
  private async pollGuild(guildId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Récupérer tous les véhicules du serveur
      const vehicles = await prisma.vehicle.findMany({
        where: { guildId },
        include: {
          VehicleState: true
        }
      });

      if (vehicles.length === 0) {
        logger.debug({ guildId }, 'Aucun véhicule à surveiller');
        return;
      }

      logger.debug({ guildId, vehicleCount: vehicles.length }, 'Début du polling');

      // Traiter chaque véhicule
      for (const vehicle of vehicles) {
        await this.pollVehicle(vehicle);
      }

      const duration = Date.now() - startTime;
      logger.debug({ guildId, duration, vehicleCount: vehicles.length }, 'Polling terminé');

    } catch (error) {
      logger.error({ 
        guildId, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors du polling du serveur');
    }
  }

  /**
   * Effectue le polling pour un véhicule spécifique
   */
  private async pollVehicle(vehicle: any): Promise<void> {
    try {
      const { guildId, name, rssUrl } = vehicle;
      const currentState = vehicle.VehicleState;

      // Récupérer le contenu RSS
      const fetchResult = await fetchRssContent(
        rssUrl,
        currentState?.lastPayloadHash,
        currentState?.lastSeenAt?.toISOString()
      );

      if (!fetchResult) {
        logger.debug({ guildId, vehicleName: name }, 'Contenu RSS inchangé');
        return;
      }

      // Parser le contenu RSS
      const parseResult = await this.parser.parseRssContent(fetchResult.content, rssUrl);
      
      if (parseResult.items.length === 0) {
        logger.warn({ guildId, vehicleName: name }, 'Aucun élément trouvé dans le RSS');
        return;
      }

      // Prendre le premier élément (le plus récent)
      const latestItem = parseResult.items[0];
      const normalizedStatus = normalizeStatus(latestItem.status);

      // Générer le hash du contenu
      const contentHash = await generateContentHash(fetchResult.content);

      // Vérifier s'il y a eu un changement
      const statusChanged = currentState?.lastStatus !== normalizedStatus;
      const contentChanged = currentState?.lastPayloadHash !== contentHash;

      if (!statusChanged && !contentChanged) {
        logger.debug({ guildId, vehicleName: name }, 'Aucun changement détecté');
        return;
      }

      // Mettre à jour l'état du véhicule
      await prisma.vehicleState.upsert({
        where: {
          guildId_name: {
            guildId,
            name
          }
        },
        update: {
          lastStatus: normalizedStatus,
          lastSeenAt: new Date(),
          lastPayloadHash: contentHash
        },
        create: {
          guildId,
          name,
          lastStatus: normalizedStatus,
          lastSeenAt: new Date(),
          lastPayloadHash: contentHash
        }
      });

      logger.info({ 
        guildId, 
        vehicleName: name, 
        oldStatus: currentState?.lastStatus, 
        newStatus: normalizedStatus 
      }, 'Changement de statut détecté');

      // Envoyer les notifications appropriées
      await this.handleNotifications(guildId, name, normalizedStatus, latestItem);

    } catch (error) {
      logger.error({ 
        guildId: vehicle.guildId, 
        vehicleName: vehicle.name,
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors du polling du véhicule');
    }
  }

  /**
   * Gère l'envoi des notifications
   */
  private async handleNotifications(
    guildId: string, 
    vehicleName: string, 
    status: string, 
    rssItem: any
  ): Promise<void> {
    try {
      // Notification publique pour "Indisponible matériel"
      if (requiresPublicNotification(status as any)) {
        await this.sendPublicNotification(guildId, vehicleName, status, rssItem);
      }

      // Notifications MP pour "Disponible"
      if (requiresDMNotification(status as any)) {
        await this.sendDMNotifications(guildId, vehicleName, status, rssItem);
      }

    } catch (error) {
      logger.error({ 
        guildId, 
        vehicleName, 
        status,
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'envoi des notifications');
    }
  }

  /**
   * Envoie une notification publique
   */
  private async sendPublicNotification(
    guildId: string, 
    vehicleName: string, 
    status: string, 
    rssItem: any
  ): Promise<void> {
    try {
      // Récupérer la configuration du serveur
      const config = await prisma.guildConfig.findUnique({
        where: { guildId }
      });

      if (!config?.channelId) {
        logger.warn({ guildId }, 'Aucun salon de notification configuré');
        return;
      }

      const channel = this.bot.client.channels.cache.get(config.channelId);
      if (!channel || !channel.isTextBased()) {
        logger.warn({ guildId, channelId: config.channelId }, 'Salon de notification introuvable');
        return;
      }

      // Créer l'embed de notification
      const embed = createPublicNotificationEmbed({
        vehicleName,
        status: status as any,
        lastUpdate: new Date(),
        sourceUrl: rssItem.sourceUrl
      });

      // Construire le message avec les mentions de rôles
      const roleMentions = config.rolesCsv 
        ? config.rolesCsv.split(',').map(roleId => `<@&${roleId}>`).join(' ')
        : '';

      const message = roleMentions ? `${roleMentions}\n` : '';

      await channel.send({ content: message, embeds: [embed] });

      logger.info({ guildId, vehicleName, status }, 'Notification publique envoyée');

    } catch (error) {
      logger.error({ 
        guildId, 
        vehicleName, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'envoi de la notification publique');
    }
  }

  /**
   * Envoie les notifications MP
   */
  private async sendDMNotifications(
    guildId: string, 
    vehicleName: string, 
    status: string, 
    rssItem: any
  ): Promise<void> {
    try {
      // Récupérer tous les abonnements pour ce véhicule
      const subscriptions = await prisma.subscription.findMany({
        where: {
          guildId,
          name: vehicleName
        }
      });

      if (subscriptions.length === 0) {
        logger.debug({ guildId, vehicleName }, 'Aucun abonnement pour ce véhicule');
        return;
      }

      // Créer l'embed de notification
      const embed = createDMNotificationEmbed({
        vehicleName,
        status: status as any,
        lastUpdate: new Date(),
        sourceUrl: rssItem.sourceUrl
      });

      let successCount = 0;
      let failCount = 0;

      // Envoyer à chaque abonné
      for (const subscription of subscriptions) {
        try {
          const user = this.bot.getUser(subscription.userId);
          if (user) {
            await user.send({ embeds: [embed] });
            successCount++;
          } else {
            failCount++;
            logger.warn({ userId: subscription.userId }, 'Utilisateur introuvable pour notification MP');
          }
        } catch (error) {
          failCount++;
          if (error instanceof Error && error.message.includes('Cannot send messages to this user')) {
            logger.warn({ userId: subscription.userId }, 'DMs fermés pour l\'utilisateur');
          } else {
            logger.error({ 
              userId: subscription.userId, 
              error: error instanceof Error ? error.message : String(error) 
            }, 'Erreur lors de l\'envoi de la notification MP');
          }
        }
      }

      logger.info({ 
        guildId, 
        vehicleName, 
        successCount, 
        failCount 
      }, 'Notifications MP envoyées');

    } catch (error) {
      logger.error({ 
        guildId, 
        vehicleName, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'envoi des notifications MP');
    }
  }
}
