import Fastify from 'fastify';
import { logger } from '../logger.js';
import { env } from '../env.js';
import { prisma } from '../db/prisma.js';

export interface Metrics {
  guilds: number;
  vehicles: number;
  subscriptions: number;
  polls: {
    total: number;
    successful: number;
    failed: number;
  };
  latencies: {
    average: number;
    min: number;
    max: number;
  };
  uptime: number;
}

export class WebServer {
  private fastify: Fastify.FastifyInstance;
  private startTime: number;
  private pollCounts = {
    total: 0,
    successful: 0,
    failed: 0
  };
  private latencies: number[] = [];

  constructor() {
    this.fastify = Fastify({
      logger: false, // On utilise notre propre logger
      trustProxy: true
    });

    this.startTime = Date.now();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Route de santé
    this.fastify.get('/healthz', async (request, reply) => {
      try {
        // Vérifier la connexion à la base de données
        await prisma.$queryRaw`SELECT 1`;
        
        reply.code(200).send({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: this.getUptime()
        });
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Health check failed');
        reply.code(503).send({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'Database connection failed'
        });
      }
    });

    // Route des métriques
    this.fastify.get('/metrics', async (request, reply) => {
      try {
        const metrics = await this.getMetrics();
        reply.code(200).send(metrics);
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Metrics collection failed');
        reply.code(500).send({
          error: 'Failed to collect metrics'
        });
      }
    });

    // Route d'information
    this.fastify.get('/', async (request, reply) => {
      reply.code(200).send({
        name: 'RSS Véhicules Bot',
        version: '1.0.0',
        description: 'Bot Discord pour la surveillance des véhicules via RSS',
        endpoints: {
          health: '/healthz',
          metrics: '/metrics'
        }
      });
    });

    // Gestion des erreurs 404
    this.fastify.setNotFoundHandler((request, reply) => {
      reply.code(404).send({
        error: 'Not Found',
        message: 'Endpoint not found',
        path: request.url
      });
    });

    // Gestion des erreurs globales
    this.fastify.setErrorHandler((error, request, reply) => {
      logger.error({ 
        error: error.message, 
        stack: error.stack,
        url: request.url,
        method: request.method
      }, 'Unhandled error in web server');
      
      reply.code(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    });
  }

  /**
   * Démarre le serveur web
   */
  public async start(): Promise<void> {
    try {
      await this.fastify.listen({ 
        port: env.PORT, 
        host: '0.0.0.0' 
      });
      
      logger.info({ 
        port: env.PORT,
        endpoints: ['/healthz', '/metrics']
      }, 'Serveur web démarré');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors du démarrage du serveur web');
      throw error;
    }
  }

  /**
   * Arrête le serveur web
   */
  public async stop(): Promise<void> {
    try {
      await this.fastify.close();
      logger.info('Serveur web arrêté');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de l\'arrêt du serveur web');
      throw error;
    }
  }

  /**
   * Enregistre une tentative de polling
   */
  public recordPoll(success: boolean, latency: number): void {
    this.pollCounts.total++;
    if (success) {
      this.pollCounts.successful++;
    } else {
      this.pollCounts.failed++;
    }
    
    this.latencies.push(latency);
    
    // Garder seulement les 100 dernières latences pour éviter la fuite mémoire
    if (this.latencies.length > 100) {
      this.latencies = this.latencies.slice(-100);
    }
  }

  /**
   * Obtient les métriques actuelles
   */
  private async getMetrics(): Promise<Metrics> {
    try {
      // Compter les guilds avec des véhicules
      const guilds = await prisma.vehicle.findMany({
        select: { guildId: true },
        distinct: ['guildId']
      });

      // Compter les véhicules
      const vehicles = await prisma.vehicle.count();

      // Compter les abonnements
      const subscriptions = await prisma.subscription.count();

      // Calculer les statistiques de latence
      const latencies = this.latencies;
      const averageLatency = latencies.length > 0 
        ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
        : 0;
      const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
      const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

      return {
        guilds: guilds.length,
        vehicles,
        subscriptions,
        polls: {
          total: this.pollCounts.total,
          successful: this.pollCounts.successful,
          failed: this.pollCounts.failed
        },
        latencies: {
          average: Math.round(averageLatency),
          min: Math.round(minLatency),
          max: Math.round(maxLatency)
        },
        uptime: this.getUptime()
      };
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors de la collecte des métriques');
      throw error;
    }
  }

  /**
   * Obtient le temps de fonctionnement en secondes
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Obtient l'instance Fastify (pour les tests)
   */
  public getFastifyInstance(): Fastify.FastifyInstance {
    return this.fastify;
  }
}
