import Parser from 'rss-parser';
import { logger } from '../logger.js';

export interface RssItemNormalized {
  vehicleId: string;
  status: string;
  updatedAt: Date;
  sourceUrl: string;
  rawTitle?: string;
  rawDescription?: string;
}

export interface RssParseResult {
  items: RssItemNormalized[];
  feedTitle?: string;
  feedDescription?: string;
  lastBuildDate?: Date;
}

/**
 * Parseur RSS générique
 */
export class RssParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'RSS-Vehicules-Bot/1.0'
      }
    });
  }

  /**
   * Parse le contenu RSS et retourne les éléments normalisés
   */
  async parseRssContent(content: string, sourceUrl: string): Promise<RssParseResult> {
    try {
      const feed = await this.parser.parseString(content);
      
      const items: RssItemNormalized[] = (feed.items || []).map((item, index) => {
        // Générer un ID unique pour le véhicule basé sur l'URL source et l'index
        const vehicleId = `${sourceUrl}#${index}`;
        
        return {
          vehicleId,
          status: this.extractStatus(item),
          updatedAt: this.extractDate(item),
          sourceUrl,
          rawTitle: item.title,
          rawDescription: item.contentSnippet || item.content
        };
      });

      logger.debug({ 
        sourceUrl, 
        itemCount: items.length,
        feedTitle: feed.title 
      }, 'RSS parsé avec succès');

      return {
        items,
        feedTitle: feed.title,
        feedDescription: feed.description,
        lastBuildDate: feed.lastBuildDate ? new Date(feed.lastBuildDate) : undefined
      };

    } catch (error) {
      logger.error({ 
        sourceUrl, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Erreur lors du parsing RSS');
      throw error;
    }
  }

  /**
   * Extrait le statut d'un élément RSS
   */
  private extractStatus(item: any): string {
    // Essayer différents champs pour trouver le statut
    const possibleStatusFields = [
      'status',
      'state',
      'etat',
      'disponibilite',
      'disponibilité',
      'title',
      'description'
    ];

    for (const field of possibleStatusFields) {
      const value = item[field];
      if (value && typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    // Si pas de statut trouvé, utiliser le titre
    return item.title || 'Statut inconnu';
  }

  /**
   * Extrait la date de mise à jour d'un élément RSS
   */
  private extractDate(item: any): Date {
    // Essayer différents champs de date
    const possibleDateFields = [
      'pubDate',
      'lastBuildDate',
      'updated',
      'date'
    ];

    for (const field of possibleDateFields) {
      const dateValue = item[field];
      if (dateValue) {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Par défaut, utiliser la date actuelle
    return new Date();
  }
}
