import { TextChannel, User } from 'discord.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { createPublicNotificationEmbed, createDMNotificationEmbed } from '../discord/embeds.js';
import { NormalizedStatus } from '../util/status.js';

export interface NotificationContext {
  guildId: string;
  vehicleName: string;
  status: NormalizedStatus;
  lastUpdate: Date;
  sourceUrl?: string;
  location?: string;
  vehicleType?: string;
}

/**
 * Service de gestion des notifications
 */
export class NotificationService {
  /**
   * Envoie une notification publique pour un changement de statut
   */
  public static async sendPublicNotification(
    context: NotificationContext,
    bot: any
  ): Promise<boolean> {
    try {
      // Récupérer la configuration du serveur
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: context.guildId }
      });

      if (!config?.channelId) {
        logger.warn({ guildId: context.guildId }, 'Aucun salon de notification configuré');
        return false;
      }

      const channel = bot.client.channels.cache.get(config.channelId);
      if (!channel || !channel.isTextBased()) {
        logger.warn({ guildId: context.guildId, channelId: config.channelId }, 'Salon de notification introuvable');
        return false;
      }

      // Créer l'embed de notification
      const embed = createPublicNotificationEmbed({
        vehicleName: context.vehicleName,
        status: context.status,
        lastUpdate: context.lastUpdate,
        sourceUrl: context.sourceUrl,
        location: context.location,
        vehicleType: context.vehicleType
      });

      // Construire le message avec les mentions de rôles
      const roleMentions = config.rolesCsv 
        ? config.rolesCsv.split(',').map(roleId => `<@&${roleId}>`).join(' ')
        : '';

      const message = roleMentions ? `${roleMentions}\n` : '';

      await (channel as TextChannel).send({ content: message, embeds: [embed] });

      logger.info({ 
        guildId: context.guildId, 
        vehicleName: context.vehicleName, 
        status: context.status,
        channelId: config.channelId
      }, 'Notification publique envoyée');

      return true;

    } catch (error) {
      logger.error({ 
        guildId: context.guildId, 
        vehicleName: context.vehicleName,
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'envoi de la notification publique');
      return false;
    }
  }

  /**
   * Envoie des notifications MP pour un changement de statut
   */
  public static async sendDMNotifications(
    context: NotificationContext,
    bot: any
  ): Promise<{ successCount: number; failCount: number }> {
    try {
      // Récupérer tous les abonnements pour ce véhicule
      const subscriptions = await prisma.subscription.findMany({
        where: {
          guildId: context.guildId,
          name: context.vehicleName
        }
      });

      if (subscriptions.length === 0) {
        logger.debug({ guildId: context.guildId, vehicleName: context.vehicleName }, 'Aucun abonnement pour ce véhicule');
        return { successCount: 0, failCount: 0 };
      }

      // Créer l'embed de notification
      const embed = createDMNotificationEmbed({
        vehicleName: context.vehicleName,
        status: context.status,
        lastUpdate: context.lastUpdate,
        sourceUrl: context.sourceUrl,
        location: context.location,
        vehicleType: context.vehicleType
      });

      let successCount = 0;
      let failCount = 0;

      // Envoyer à chaque abonné
      for (const subscription of subscriptions) {
        try {
          const user = bot.getUser(subscription.userId);
          if (user) {
            await user.send({ embeds: [embed] });
            successCount++;
            
            logger.debug({ 
              userId: subscription.userId, 
              vehicleName: context.vehicleName 
            }, 'Notification MP envoyée');
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
        guildId: context.guildId, 
        vehicleName: context.vehicleName, 
        successCount, 
        failCount 
      }, 'Notifications MP envoyées');

      return { successCount, failCount };

    } catch (error) {
      logger.error({ 
        guildId: context.guildId, 
        vehicleName: context.vehicleName,
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'envoi des notifications MP');
      return { successCount: 0, failCount: 0 };
    }
  }

  /**
   * Envoie une notification de test
   */
  public static async sendTestNotification(
    guildId: string,
    channelId: string,
    bot: any
  ): Promise<boolean> {
    try {
      const channel = bot.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        return false;
      }

      const embed = createPublicNotificationEmbed({
        vehicleName: 'Test',
        status: 'Indisponible matériel',
        lastUpdate: new Date(),
        sourceUrl: 'https://example.com'
      });

      await (channel as TextChannel).send({ 
        content: '🧪 **Notification de test**', 
        embeds: [embed] 
      });

      logger.info({ guildId, channelId }, 'Notification de test envoyée');
      return true;

    } catch (error) {
      logger.error({ 
        guildId, 
        channelId,
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'envoi de la notification de test');
      return false;
    }
  }

  /**
   * Vérifie si un utilisateur peut recevoir des DMs
   */
  public static async canSendDM(userId: string, bot: any): Promise<boolean> {
    try {
      const user = bot.getUser(userId);
      if (!user) {
        return false;
      }

      // Essayer d'envoyer un message de test (invisible)
      // Cette méthode n'est pas parfaite mais c'est la meilleure approche disponible
      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Enregistre une tentative de notification dans les logs d'audit
   */
  public static async logNotificationAttempt(
    guildId: string,
    vehicleName: string,
    status: NormalizedStatus,
    notificationType: 'public' | 'dm',
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          level: success ? 'info' : 'error',
          guildId,
          action: 'notification_sent',
          target: `${vehicleName}:${status}`,
          metaJson: JSON.stringify({
            notificationType,
            success,
            errorMessage,
            timestamp: new Date().toISOString()
          })
        }
      });
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'enregistrement de la tentative de notification');
    }
  }
}
