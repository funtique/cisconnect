import { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { logger } from '../logger.js';
import { env } from '../env.js';

export interface DiscordCommand {
  data: SlashCommandBuilder;
  execute: (interaction: any) => Promise<void>;
}

export class DiscordBot {
  public client: Client;
  public commands: Collection<string, DiscordCommand> = new Collection();
  private rest: REST;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
      ],
      partials: [] // Pas de partials nécessaires pour ce bot
    });

    this.rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      logger.info({ 
        botTag: this.client.user?.tag,
        guildCount: this.client.guilds.cache.size,
        userCount: this.client.users.cache.size
      }, 'Bot Discord prêt');
    });

    this.client.on('error', (error) => {
      logger.error({ error: error.message }, 'Erreur Discord client');
    });

    this.client.on('warn', (info) => {
      logger.warn({ info }, 'Avertissement Discord');
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) {
        logger.warn({ commandName: interaction.commandName }, 'Commande inconnue');
        return;
      }

      try {
        const startTime = Date.now();
        await command.execute(interaction);
        const duration = Date.now() - startTime;
        
        logger.info({
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          duration
        }, 'Commande exécutée');
      } catch (error) {
        logger.error({
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guildId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Erreur lors de l\'exécution de la commande');

        const errorMessage = 'Une erreur est survenue lors de l\'exécution de cette commande.';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });
  }

  /**
   * Enregistre une commande
   */
  public registerCommand(command: DiscordCommand): void {
    this.commands.set(command.data.name, command);
    logger.debug({ commandName: command.data.name }, 'Commande enregistrée');
  }

  /**
   * Enregistre toutes les commandes auprès de Discord
   */
  public async registerSlashCommands(): Promise<void> {
    try {
      const commandsData = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());
      
      logger.info({ commandCount: commandsData.length }, 'Enregistrement des commandes slash...');

      await this.rest.put(
        Routes.applicationCommands(this.client.user!.id),
        { body: commandsData }
      );

      logger.info('Commandes slash enregistrées avec succès');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'enregistrement des commandes');
      throw error;
    }
  }

  /**
   * Connecte le bot à Discord
   */
  public async connect(): Promise<void> {
    try {
      await this.client.login(env.DISCORD_TOKEN);
      logger.info('Connexion au bot Discord...');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur de connexion Discord');
      throw error;
    }
  }

  /**
   * Déconnecte le bot
   */
  public async disconnect(): Promise<void> {
    try {
      await this.client.destroy();
      logger.info('Bot Discord déconnecté');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur de déconnexion Discord');
      throw error;
    }
  }

  /**
   * Obtient un guild par ID
   */
  public getGuild(guildId: string) {
    return this.client.guilds.cache.get(guildId);
  }

  /**
   * Obtient un utilisateur par ID
   */
  public getUser(userId: string) {
    return this.client.users.cache.get(userId);
  }
}
