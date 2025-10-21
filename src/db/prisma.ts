import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'info', emit: 'event' },
      { level: 'warn', emit: 'event' }
    ]
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Log Prisma events
prisma.$on('query', (e) => {
  logger.debug({ query: e.query, params: e.params, duration: e.duration }, 'Prisma query');
});

prisma.$on('error', (e) => {
  logger.error({ error: e.message }, 'Prisma error');
});

prisma.$on('info', (e) => {
  logger.info({ message: e.message }, 'Prisma info');
});

prisma.$on('warn', (e) => {
  logger.warn({ message: e.message }, 'Prisma warning');
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Base de données connectée');
  } catch (error) {
    logger.error({ error }, 'Erreur de connexion à la base de données');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Base de données déconnectée');
  } catch (error) {
    logger.error({ error }, 'Erreur de déconnexion de la base de données');
    throw error;
  }
}
