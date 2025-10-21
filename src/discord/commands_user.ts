import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { requireGuild } from './guards.js';
import { createUserSubscriptionsEmbed, createVehicleListEmbed, createVehicleStatusEmbed } from './embeds.js';
import { DiscordCommand } from './client.js';

/**
 * Commande /abonner - S'abonner à un véhicule
 */
export const abonnerCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('abonner')
    .setDescription('S\'abonner aux notifications MP d\'un véhicule')
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Nom du véhicule')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.', ephemeral: true });
      return;
    }

    const nom = interaction.options.getString('nom', true);

    try {
      // Vérifier si le véhicule existe
      const vehicle = await prisma.vehicle.findUnique({
        where: {
          guildId_name: {
            guildId: interaction.guildId!,
            name: nom
          }
        }
      });

      if (!vehicle) {
        await interaction.reply({ 
          content: `❌ Le véhicule **${nom}** n'existe pas sur ce serveur.`, 
          ephemeral: true 
        });
        return;
      }

      // Vérifier si l'utilisateur est déjà abonné
      const existingSubscription = await prisma.subscription.findUnique({
        where: {
          guildId_userId_name: {
            guildId: interaction.guildId!,
            userId: interaction.user.id,
            name: nom
          }
        }
      });

      if (existingSubscription) {
        await interaction.reply({ 
          content: `❌ Vous êtes déjà abonné au véhicule **${nom}**.`, 
          ephemeral: true 
        });
        return;
      }

      // Créer l'abonnement
      await prisma.subscription.create({
        data: {
          guildId: interaction.guildId!,
          userId: interaction.user.id,
          name: nom
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        vehicleName: nom
      }, 'Utilisateur abonné à un véhicule');

      await interaction.reply({ 
        content: `✅ Vous êtes maintenant abonné au véhicule **${nom}** !\nVous recevrez une notification MP quand il redeviendra disponible.`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de l\'abonnement');

      await interaction.reply({ 
        content: '❌ Erreur lors de l\'abonnement.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /desabonner - Se désabonner d'un véhicule
 */
export const desabonnerCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('desabonner')
    .setDescription('Se désabonner d\'un véhicule')
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Nom du véhicule')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.', ephemeral: true });
      return;
    }

    const nom = interaction.options.getString('nom', true);

    try {
      // Vérifier si l'abonnement existe
      const subscription = await prisma.subscription.findUnique({
        where: {
          guildId_userId_name: {
            guildId: interaction.guildId!,
            userId: interaction.user.id,
            name: nom
          }
        }
      });

      if (!subscription) {
        await interaction.reply({ 
          content: `❌ Vous n'êtes pas abonné au véhicule **${nom}**.`, 
          ephemeral: true 
        });
        return;
      }

      // Supprimer l'abonnement
      await prisma.subscription.delete({
        where: {
          guildId_userId_name: {
            guildId: interaction.guildId!,
            userId: interaction.user.id,
            name: nom
          }
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        vehicleName: nom
      }, 'Utilisateur désabonné d\'un véhicule');

      await interaction.reply({ 
        content: `✅ Vous n'êtes plus abonné au véhicule **${nom}**.`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors du désabonnement');

      await interaction.reply({ 
        content: '❌ Erreur lors du désabonnement.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /mes - Voir mes abonnements
 */
export const mesCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('mes')
    .setDescription('Voir mes abonnements'),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: interaction.user.id },
        include: {
          Vehicle: {
            include: {
              Guild: true
            }
          }
        }
      });

      const subscriptionData = subscriptions.map(sub => ({
        vehicleName: sub.name,
        guildName: sub.Vehicle?.Guild?.name || 'Serveur inconnu',
        createdAt: sub.createdAt
      }));

      const embed = createUserSubscriptionsEmbed(subscriptionData);
      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      logger.error({
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la récupération des abonnements');

      await interaction.reply({ 
        content: '❌ Erreur lors de la récupération de vos abonnements.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /vehicules - Lister les véhicules (lecture seule)
 */
export const vehiculesCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('vehicules')
    .setDescription('Lister les véhicules disponibles sur ce serveur'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.', ephemeral: true });
      return;
    }

    try {
      const vehicles = await prisma.vehicle.findMany({
        where: { guildId: interaction.guildId! },
        include: {
          VehicleState: true
        }
      });

      const vehicleData = vehicles.map(vehicle => ({
        name: vehicle.name,
        status: vehicle.VehicleState?.lastStatus || 'Inconnu',
        lastUpdate: vehicle.VehicleState?.lastSeenAt || vehicle.createdAt,
        rssUrl: vehicle.rssUrl
      }));

      const embed = createVehicleListEmbed(vehicleData);
      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la récupération des véhicules');

      await interaction.reply({ 
        content: '❌ Erreur lors de la récupération des véhicules.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /voir - Voir le statut d'un véhicule
 */
export const voirCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('voir')
    .setDescription('Voir le statut d\'un véhicule')
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Nom du véhicule')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.', ephemeral: true });
      return;
    }

    const nom = interaction.options.getString('nom', true);

    try {
      const vehicle = await prisma.vehicle.findUnique({
        where: {
          guildId_name: {
            guildId: interaction.guildId!,
            name: nom
          }
        },
        include: {
          VehicleState: true
        }
      });

      if (!vehicle) {
        await interaction.reply({ 
          content: `❌ Le véhicule **${nom}** n'existe pas sur ce serveur.`, 
          ephemeral: true 
        });
        return;
      }

      const status = vehicle.VehicleState?.lastStatus || 'Inconnu';
      const lastUpdate = vehicle.VehicleState?.lastSeenAt || vehicle.createdAt;

      const embed = createVehicleStatusEmbed({
        vehicleName: vehicle.name,
        status: status as any,
        lastUpdate,
        sourceUrl: vehicle.rssUrl
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la récupération du statut');

      await interaction.reply({ 
        content: '❌ Erreur lors de la récupération du statut.', 
        ephemeral: true 
      });
    }
  }
};
