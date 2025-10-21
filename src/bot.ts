import { validateEnv } from './env.js';
import { logger } from './logger.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import { DiscordBot } from './discord/client.js';
import { PollingScheduler } from './core/scheduler.js';
import { WebServer } from './web/server.js';

// Commandes admin
import { 
  ajoutCommand, 
  supprCommand, 
  salonCommand, 
  rolesAjouterCommand, 
  rolesRetirerCommand, 
  configVoirCommand, 
  pollingCommand, 
  listeCommand, 
  statutCommand 
} from './discord/commands_admin.js';

// Commandes utilisateur
import { 
  abonnerCommand, 
  desabonnerCommand, 
  mesCommand, 
  vehiculesCommand, 
  voirCommand 
} from './discord/commands_user.js';

// Variables globales
let bot: DiscordBot;
let scheduler: PollingScheduler;
let webServer: WebServer;

/**
 * Gestionnaire de signaux pour un arrêt propre
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Signal de fermeture reçu, arrêt en cours...');

  try {
    // Arrêter le scheduler
    if (scheduler) {
      scheduler.stop();
      logger.info('Scheduler arrêté');
    }

    // Arrêter le serveur web
    if (webServer) {
      await webServer.stop();
      logger.info('Serveur web arrêté');
    }

    // Déconnecter le bot Discord
    if (bot) {
      await bot.disconnect();
      logger.info('Bot Discord déconnecté');
    }

    // Déconnecter la base de données
    await disconnectDatabase();
    logger.info('Base de données déconnectée');

    logger.info('Arrêt terminé avec succès');
    process.exit(0);

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 'Erreur lors de l\'arrêt');
    process.exit(1);
  }
}

/**
 * Fonction principale
 */
async function main(): Promise<void> {
  try {
    // Valider les variables d'environnement
    const env = validateEnv();
    logger.info({ 
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      pollingSec: env.DEFAULT_POLLING_SEC
    }, 'Configuration validée');

    // Connecter à la base de données
    await connectDatabase();

    // Créer et configurer le bot Discord
    bot = new DiscordBot();

    // Enregistrer toutes les commandes
    const adminCommands = [
      ajoutCommand,
      supprCommand,
      salonCommand,
      rolesAjouterCommand,
      rolesRetirerCommand,
      configVoirCommand,
      pollingCommand,
      listeCommand,
      statutCommand
    ];

    const userCommands = [
      abonnerCommand,
      desabonnerCommand,
      mesCommand,
      vehiculesCommand,
      voirCommand
    ];

    // Enregistrer les commandes admin
    for (const command of adminCommands) {
      bot.registerCommand(command);
    }

    // Enregistrer les commandes utilisateur
    for (const command of userCommands) {
      bot.registerCommand(command);
    }

    // Connecter le bot à Discord
    await bot.connect();

    // Enregistrer les commandes slash
    await bot.registerSlashCommands();

    // Créer et démarrer le scheduler
    scheduler = new PollingScheduler(bot);
    await scheduler.start();

    // Créer et démarrer le serveur web
    webServer = new WebServer();
    await webServer.start();

    logger.info('🚀 RSS Véhicules Bot démarré avec succès !');

    // Configurer les gestionnaires de signaux
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Pour nodemon

    // Gestionnaire d'erreurs non capturées
    process.on('uncaughtException', (error) => {
      logger.fatal({ error: error.message, stack: error.stack }, 'Exception non capturée');
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal({ reason, promise }, 'Promesse rejetée non gérée');
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.fatal({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Erreur fatale lors du démarrage');
    process.exit(1);
  }
}

// Démarrer l'application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.fatal({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 'Erreur fatale');
    process.exit(1);
  });
}
