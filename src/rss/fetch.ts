import { request } from 'undici';
import { logger } from '../logger.js';
import { env } from '../env.js';

export interface FetchResult {
  content: string;
  etag?: string;
  lastModified?: string;
  statusCode: number;
  headers: Record<string, string>;
}

/**
 * Récupère le contenu RSS avec gestion des headers ETag/Last-Modified
 */
export async function fetchRssContent(
  url: string,
  etag?: string,
  lastModified?: string
): Promise<FetchResult | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'RSS-Vehicules-Bot/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  };

  // Ajouter les headers conditionnels si disponibles
  if (etag) {
    headers['If-None-Match'] = etag;
  }
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }

  try {
    const response = await request(url, {
      method: 'GET',
      headers,
      timeout: env.HTTP_TIMEOUT_MS,
      maxRedirections: 3
    });

    const statusCode = response.statusCode;
    const responseHeaders = response.headers as Record<string, string>;

    // Si pas de modification (304), retourner null
    if (statusCode === 304) {
      logger.debug({ url, statusCode }, 'Contenu RSS inchangé (304)');
      return null;
    }

    // Vérifier le code de statut
    if (statusCode < 200 || statusCode >= 300) {
      logger.warn({ url, statusCode }, 'Code de statut HTTP non-OK');
      return null;
    }

    // Lire le contenu
    const content = await response.body.text();
    
    if (!content || content.trim().length === 0) {
      logger.warn({ url }, 'Contenu RSS vide');
      return null;
    }

    logger.debug({ url, contentLength: content.length }, 'Contenu RSS récupéré');

    return {
      content,
      etag: responseHeaders.etag,
      lastModified: responseHeaders['last-modified'],
      statusCode,
      headers: responseHeaders
    };

  } catch (error) {
    logger.error({ url, error: error instanceof Error ? error.message : String(error) }, 'Erreur lors de la récupération RSS');
    return null;
  }
}

/**
 * Génère un hash du contenu pour détecter les changements
 */
export async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
