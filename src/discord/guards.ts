import { ChatInputCommandInteraction, GuildMember, PermissionsBitField } from 'discord.js';
import { logger } from '../logger.js';

/**
 * Vérifie si l'utilisateur a les permissions d'administrateur
 */
export function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) {
    return false;
  }

  const member = interaction.member as GuildMember;
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

/**
 * Vérifie si l'utilisateur peut gérer les rôles
 */
export function canManageRoles(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) {
    return false;
  }

  const member = interaction.member as GuildMember;
  return member.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

/**
 * Vérifie si l'utilisateur peut gérer les salons
 */
export function canManageChannels(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) {
    return false;
  }

  const member = interaction.member as GuildMember;
  return member.permissions.has(PermissionsBitField.Flags.ManageChannels);
}

/**
 * Vérifie si l'utilisateur peut envoyer des messages dans le salon
 */
export function canSendMessages(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) {
    return false;
  }

  const member = interaction.member as GuildMember;
  const channel = interaction.channel;
  
  if (!channel) {
    return false;
  }

  return member.permissionsIn(channel).has(PermissionsBitField.Flags.SendMessages);
}

/**
 * Vérifie si l'utilisateur peut envoyer des messages privés
 */
export function canSendDMs(interaction: ChatInputCommandInteraction): boolean {
  // Vérifier si l'utilisateur a des DMs fermés
  // Cette vérification est approximative car Discord ne fournit pas d'API directe
  return true; // On essaiera d'envoyer et on gérera l'erreur
}

/**
 * Middleware pour vérifier les permissions d'admin
 */
export function requireAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (!isAdmin(interaction)) {
    logger.warn({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      commandName: interaction.commandName
    }, 'Tentative d\'accès à une commande admin sans permissions');
    return false;
  }
  return true;
}

/**
 * Middleware pour vérifier les permissions de gestion des rôles
 */
export function requireRoleManagement(interaction: ChatInputCommandInteraction): boolean {
  if (!canManageRoles(interaction)) {
    logger.warn({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      commandName: interaction.commandName
    }, 'Tentative de gestion des rôles sans permissions');
    return false;
  }
  return true;
}

/**
 * Middleware pour vérifier les permissions de gestion des salons
 */
export function requireChannelManagement(interaction: ChatInputCommandInteraction): boolean {
  if (!canManageChannels(interaction)) {
    logger.warn({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      commandName: interaction.commandName
    }, 'Tentative de gestion des salons sans permissions');
    return false;
  }
  return true;
}

/**
 * Vérifie si la commande est exécutée dans un serveur
 */
export function requireGuild(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.guild) {
    logger.warn({
      userId: interaction.user.id,
      commandName: interaction.commandName
    }, 'Commande exécutée en dehors d\'un serveur');
    return false;
  }
  return true;
}
