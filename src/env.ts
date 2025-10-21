import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN est requis'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DEFAULT_POLLING_SEC: z.coerce.number().int().min(30).max(120).default(120),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  PORT: z.coerce.number().int().min(1000).max(65535).default(8080),
  DATABASE_URL: z.string().default('file:./data/database.db')
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      throw new Error(`Configuration invalide:\n${errorMessages.join('\n')}`);
    }
    throw error;
  }
}
