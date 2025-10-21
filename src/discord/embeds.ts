import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { NormalizedStatus, getStatusEmoji, getStatusColor } from '../util/status.js';

export interface VehicleStatusEmbed {
  vehicleName: string;
  status: NormalizedStatus;
  lastUpdate: Date;
  sourceUrl?: string;
  location?: string;
  vehicleType?: string;
}

/**
 * Crée un embed pour le statut d'un véhicule
 */
export function createVehicleStatusEmbed(data: VehicleStatusEmbed): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${getStatusEmoji(data.status)} ${data.vehicleName}`)
    .setColor(getStatusColor(data.status) as ColorResolvable)
    .setTimestamp(data.lastUpdate)
    .addFields(
      {
        name: 'Statut',
        value: data.status,
        inline: true
      },
      {
        name: 'Dernière mise à jour',
        value: `<t:${Math.floor(data.lastUpdate.getTime() / 1000)}:R>`,
        inline: true
      }
    );

  // Ajouter des informations supplémentaires si disponibles
  if (data.location) {
    embed.addFields({
      name: 'Localisation',
      value: data.location,
      inline: true
    });
  }

  if (data.vehicleType) {
    embed.addFields({
      name: 'Type de véhicule',
      value: data.vehicleType,
      inline: true
    });
  }

  if (data.sourceUrl) {
    embed.setURL(data.sourceUrl);
  }

  // Ajouter un footer avec des informations sur le bot
  embed.setFooter({
    text: 'RSS Véhicules Bot',
    iconURL: 'https://cdn.discordapp.com/app-icons/1234567890123456789/icon.png' // Remplacer par l'icône du bot
  });

  return embed;
}

/**
 * Crée un embed pour une notification publique (Indisponible matériel)
 */
export function createPublicNotificationEmbed(data: VehicleStatusEmbed): EmbedBuilder {
  const embed = createVehicleStatusEmbed(data);
  
  embed.setTitle(`🚨 ${data.vehicleName} - ${data.status}`);
  embed.setDescription(`⚠️ **Attention** : Le véhicule ${data.vehicleName} est actuellement **${data.status.toLowerCase()}**.`);
  
  return embed;
}

/**
 * Crée un embed pour une notification MP (Disponible)
 */
export function createDMNotificationEmbed(data: VehicleStatusEmbed): EmbedBuilder {
  const embed = createVehicleStatusEmbed(data);
  
  embed.setTitle(`✅ ${data.vehicleName} - ${data.status}`);
  embed.setDescription(`🎉 **Bonne nouvelle** : Le véhicule ${data.vehicleName} est maintenant **${data.status.toLowerCase()}** !`);
  
  return embed;
}

/**
 * Crée un embed pour la liste des véhicules
 */
export function createVehicleListEmbed(vehicles: Array<{
  name: string;
  status: NormalizedStatus;
  lastUpdate: Date;
  rssUrl: string;
}>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📋 Liste des véhicules')
    .setColor(0x0099ff)
    .setTimestamp();

  if (vehicles.length === 0) {
    embed.setDescription('Aucun véhicule configuré.');
    return embed;
  }

  const vehicleList = vehicles.map(vehicle => {
    const emoji = getStatusEmoji(vehicle.status);
    const lastUpdate = `<t:${Math.floor(vehicle.lastUpdate.getTime() / 1000)}:R>`;
    return `${emoji} **${vehicle.name}** - ${vehicle.status}\n   └ Dernière mise à jour: ${lastUpdate}`;
  }).join('\n\n');

  embed.setDescription(vehicleList);
  embed.setFooter({
    text: `${vehicles.length} véhicule(s) configuré(s)`,
    iconURL: 'https://cdn.discordapp.com/app-icons/1234567890123456789/icon.png'
  });

  return embed;
}

/**
 * Crée un embed pour la configuration du serveur
 */
export function createConfigEmbed(config: {
  channelId?: string;
  roles: string[];
  pollingSec: number;
  vehicleCount: number;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configuration du serveur')
    .setColor(0x00ff00)
    .setTimestamp();

  const channelMention = config.channelId ? `<#${config.channelId}>` : 'Non configuré';
  const rolesMention = config.roles.length > 0 
    ? config.roles.map(roleId => `<@&${roleId}>`).join(', ')
    : 'Aucun rôle configuré';

  embed.addFields(
    {
      name: 'Salon de notification',
      value: channelMention,
      inline: true
    },
    {
      name: 'Rôles mentionnés',
      value: rolesMention,
      inline: false
    },
    {
      name: 'Intervalle de polling',
      value: `${config.pollingSec} secondes`,
      inline: true
    },
    {
      name: 'Nombre de véhicules',
      value: config.vehicleCount.toString(),
      inline: true
    }
  );

  return embed;
}

/**
 * Crée un embed pour les abonnements d'un utilisateur
 */
export function createUserSubscriptionsEmbed(subscriptions: Array<{
  vehicleName: string;
  guildName: string;
  createdAt: Date;
}>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📬 Mes abonnements')
    .setColor(0x00ff00)
    .setTimestamp();

  if (subscriptions.length === 0) {
    embed.setDescription('Vous n\'êtes abonné à aucun véhicule.');
    return embed;
  }

  const subscriptionList = subscriptions.map(sub => {
    const createdAt = `<t:${Math.floor(sub.createdAt.getTime() / 1000)}:R>`;
    return `🔔 **${sub.vehicleName}** (${sub.guildName})\n   └ Abonné depuis: ${createdAt}`;
  }).join('\n\n');

  embed.setDescription(subscriptionList);
  embed.setFooter({
    text: `${subscriptions.length} abonnement(s)`,
    iconURL: 'https://cdn.discordapp.com/app-icons/1234567890123456789/icon.png'
  });

  return embed;
}
