import { RssItemNormalized } from './parse.js';
import { normalizeStatus, NormalizedStatus } from '../util/status.js';
import { logger } from '../logger.js';

/**
 * Mapper spécialisé pour les flux monpompier.com
 */
export class MonPompierMapper {
  /**
   * Mappe les éléments RSS de monpompier vers le format normalisé
   */
  static mapItems(items: RssItemNormalized[]): Array<RssItemNormalized & { normalizedStatus: NormalizedStatus }> {
    return items.map(item => {
      const normalizedStatus = normalizeStatus(item.status);
      
      logger.debug({ 
        vehicleId: item.vehicleId,
        rawStatus: item.status,
        normalizedStatus 
      }, 'Statut normalisé');

      return {
        ...item,
        normalizedStatus
      };
    });
  }

  /**
   * Extrait les informations spécifiques aux véhicules monpompier
   */
  static extractVehicleInfo(item: RssItemNormalized): {
    vehicleName?: string;
    vehicleType?: string;
    location?: string;
  } {
    const title = item.rawTitle || '';
    const description = item.rawDescription || '';

    // Patterns pour extraire les informations du véhicule
    const vehicleNameMatch = title.match(/(?:Véhicule|Engin|Camion|Ambulance)\s*:?\s*([A-Z0-9\-\s]+)/i);
    const vehicleTypeMatch = title.match(/(Véhicule|Engin|Camion|Ambulance|VSAV|FPT|EPA|VLM)/i);
    const locationMatch = title.match(/(?:à|depuis|depuis)\s+([A-Za-z\s\-]+)/i);

    return {
      vehicleName: vehicleNameMatch?.[1]?.trim(),
      vehicleType: vehicleTypeMatch?.[1],
      location: locationMatch?.[1]?.trim()
    };
  }

  /**
   * Valide si un flux semble être de type monpompier
   */
  static isMonPompierFeed(feedTitle?: string, feedDescription?: string): boolean {
    const title = feedTitle?.toLowerCase() || '';
    const description = feedDescription?.toLowerCase() || '';
    
    const monpompierKeywords = [
      'monpompier',
      'pompiers',
      'sapeurs-pompiers',
      'sapeurs pompiers',
      'véhicules',
      'engins',
      'intervention',
      'caserne'
    ];

    return monpompierKeywords.some(keyword => 
      title.includes(keyword) || description.includes(keyword)
    );
  }

  /**
   * Enrichit les éléments avec des informations spécifiques monpompier
   */
  static enrichItems(items: RssItemNormalized[]): Array<RssItemNormalized & { 
    normalizedStatus: NormalizedStatus;
    vehicleInfo: ReturnType<typeof MonPompierMapper.extractVehicleInfo>;
  }> {
    return items.map(item => {
      const normalizedStatus = normalizeStatus(item.status);
      const vehicleInfo = this.extractVehicleInfo(item);

      return {
        ...item,
        normalizedStatus,
        vehicleInfo
      };
    });
  }
}
