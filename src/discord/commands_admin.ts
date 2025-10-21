import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { requireAdmin, requireGuild } from './guards.js';
import { createConfigEmbed, createVehicleListEmbed, createVehicleStatusEmbed } from './embeds.js';
import { DiscordCommand } from './client.js';

/**
 * Commande /ajout - Ajouter un véhicule
 */
export const ajoutCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('ajout')
    .setDescription('Ajouter un véhicule à surveiller')
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('URL du flux RSS du véhicule')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Nom du véhicule (unique par serveur)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
      return;
    }

    const url = interaction.options.getString('url', true);
    const nom = interaction.options.getString('nom', true);

    try {
      // Vérifier si le véhicule existe déjà
      const existingVehicle = await prisma.vehicle.findUnique({
        where: {
          guildId_name: {
            guildId: interaction.guildId!,
            name: nom
          }
        }
      });

      if (existingVehicle) {
        await interaction.reply({ 
          content: `❌ Le véhicule **${nom}** existe déjà sur ce serveur.`, 
          ephemeral: true 
        });
        return;
      }

      // Créer le véhicule
      await prisma.vehicle.create({
        data: {
          guildId: interaction.guildId!,
          name: nom,
          rssUrl: url
        }
      });

      // Créer l'état initial
      await prisma.vehicleState.create({
        data: {
          guildId: interaction.guildId!,
          name: nom,
          lastStatus: 'Inconnu',
          lastSeenAt: new Date()
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        vehicleName: nom,
        rssUrl: url
      }, 'Véhicule ajouté');

      await interaction.reply({ 
        content: `✅ Véhicule **${nom}** ajouté avec succès !\nURL: ${url}`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de l\'ajout du véhicule');

      await interaction.reply({ 
        content: '❌ Erreur lors de l\'ajout du véhicule.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /suppr - Supprimer un véhicule
 */
export const supprCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('suppr')
    .setDescription('Supprimer un véhicule')
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Nom du véhicule à supprimer')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
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

      // Supprimer le véhicule et ses données associées
      await prisma.$transaction([
        prisma.subscription.deleteMany({
          where: {
            guildId: interaction.guildId!,
            name: nom
          }
        }),
        prisma.vehicleState.deleteMany({
          where: {
            guildId: interaction.guildId!,
            name: nom
          }
        }),
        prisma.vehicle.delete({
          where: {
            guildId_name: {
              guildId: interaction.guildId!,
              name: nom
            }
          }
        })
      ]);

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        vehicleName: nom
      }, 'Véhicule supprimé');

      await interaction.reply({ 
        content: `✅ Véhicule **${nom}** supprimé avec succès !`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la suppression du véhicule');

      await interaction.reply({ 
        content: '❌ Erreur lors de la suppression du véhicule.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /salon - Définir le salon de notification
 */
export const salonCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('salon')
    .setDescription('Définir le salon pour les notifications publiques')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Salon pour les notifications')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel('canal', true);

    try {
      // Upsert la configuration
      await prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        update: { channelId: channel.id },
        create: {
          guildId: interaction.guildId!,
          channelId: channel.id
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: channel.id
      }, 'Salon de notification configuré');

      await interaction.reply({ 
        content: `✅ Salon de notification défini : ${channel}`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la configuration du salon');

      await interaction.reply({ 
        content: '❌ Erreur lors de la configuration du salon.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /roles_ajouter - Ajouter des rôles
 */
export const rolesAjouterCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('roles_ajouter')
    .setDescription('Ajouter des rôles pour les notifications')
    .addRoleOption(option =>
      option
        .setName('roles')
        .setDescription('Rôles à ajouter')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
      return;
    }

    const role = interaction.options.getRole('roles', true);

    try {
      // Récupérer la configuration actuelle
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId! }
      });

      const currentRoles = config?.rolesCsv ? config.rolesCsv.split(',') : [];
      
      if (currentRoles.includes(role.id)) {
        await interaction.reply({ 
          content: `❌ Le rôle ${role} est déjà configuré.`, 
          ephemeral: true 
        });
        return;
      }

      const newRoles = [...currentRoles, role.id];

      // Mettre à jour la configuration
      await prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        update: { rolesCsv: newRoles.join(',') },
        create: {
          guildId: interaction.guildId!,
          rolesCsv: newRoles.join(',')
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleId: role.id,
        roleName: role.name
      }, 'Rôle ajouté aux notifications');

      await interaction.reply({ 
        content: `✅ Rôle ${role} ajouté aux notifications !`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de l\'ajout du rôle');

      await interaction.reply({ 
        content: '❌ Erreur lors de l\'ajout du rôle.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /roles_retirer - Retirer des rôles
 */
export const rolesRetirerCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('roles_retirer')
    .setDescription('Retirer des rôles des notifications')
    .addRoleOption(option =>
      option
        .setName('roles')
        .setDescription('Rôles à retirer')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
      return;
    }

    const role = interaction.options.getRole('roles', true);

    try {
      // Récupérer la configuration actuelle
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId! }
      });

      const currentRoles = config?.rolesCsv ? config.rolesCsv.split(',') : [];
      
      if (!currentRoles.includes(role.id)) {
        await interaction.reply({ 
          content: `❌ Le rôle ${role} n'est pas configuré.`, 
          ephemeral: true 
        });
        return;
      }

      const newRoles = currentRoles.filter(id => id !== role.id);

      // Mettre à jour la configuration
      await prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        update: { rolesCsv: newRoles.join(',') },
        create: {
          guildId: interaction.guildId!,
          rolesCsv: newRoles.join(',')
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleId: role.id,
        roleName: role.name
      }, 'Rôle retiré des notifications');

      await interaction.reply({ 
        content: `✅ Rôle ${role} retiré des notifications !`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la suppression du rôle');

      await interaction.reply({ 
        content: '❌ Erreur lors de la suppression du rôle.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /config_voir - Voir la configuration
 */
export const configVoirCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('config_voir')
    .setDescription('Afficher la configuration du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
      return;
    }

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId! }
      });

      const vehicleCount = await prisma.vehicle.count({
        where: { guildId: interaction.guildId! }
      });

      const roles = config?.rolesCsv ? config.rolesCsv.split(',') : [];

      const embed = createConfigEmbed({
        channelId: config?.channelId,
        roles,
        pollingSec: config?.pollingSec || 120,
        vehicleCount
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la récupération de la configuration');

      await interaction.reply({ 
        content: '❌ Erreur lors de la récupération de la configuration.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /polling - Modifier l'intervalle de polling
 */
export const pollingCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('polling')
    .setDescription('Modifier l\'intervalle de polling (30-120 secondes)')
    .addIntegerOption(option =>
      option
        .setName('sec')
        .setDescription('Intervalle en secondes (30-120)')
        .setRequired(true)
        .setMinValue(30)
        .setMaxValue(120)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
      return;
    }

    const sec = interaction.options.getInteger('sec', true);

    try {
      await prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        update: { pollingSec: sec },
        create: {
          guildId: interaction.guildId!,
          pollingSec: sec
        }
      });

      logger.info({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        pollingSec: sec
      }, 'Intervalle de polling modifié');

      await interaction.reply({ 
        content: `✅ Intervalle de polling défini à ${sec} secondes.`, 
        ephemeral: true 
      });

    } catch (error) {
      logger.error({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Erreur lors de la modification du polling');

      await interaction.reply({ 
        content: '❌ Erreur lors de la modification du polling.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /liste - Lister les véhicules
 */
export const listeCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('liste')
    .setDescription('Lister tous les véhicules configurés')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
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
      }, 'Erreur lors de la récupération de la liste');

      await interaction.reply({ 
        content: '❌ Erreur lors de la récupération de la liste.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Commande /statut - Vérifier le statut d'un véhicule
 */
export const statutCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('statut')
    .setDescription('Vérifier le statut actuel d\'un véhicule')
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Nom du véhicule à vérifier')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!requireGuild(interaction) || !requireAdmin(interaction)) {
      await interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
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
      }, 'Erreur lors de la vérification du statut');

      await interaction.reply({ 
        content: '❌ Erreur lors de la vérification du statut.', 
        ephemeral: true 
      });
    }
  }
};
