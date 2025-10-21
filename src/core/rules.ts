import { NormalizedStatus } from '../util/status.js';

/**
 * Règles métier pour la détection des changements et notifications
 */

export interface ChangeDetectionRule {
  /**
   * Vérifie si un changement de statut nécessite une action
   */
  shouldTriggerNotification(oldStatus: string, newStatus: NormalizedStatus): boolean;
  
  /**
   * Détermine le type de notification à envoyer
   */
  getNotificationType(status: NormalizedStatus): 'public' | 'dm' | 'none';
  
  /**
   * Vérifie si le changement est significatif
   */
  isSignificantChange(oldStatus: string, newStatus: NormalizedStatus): boolean;
}

/**
 * Règles de détection pour les véhicules
 */
export class VehicleChangeRules implements ChangeDetectionRule {
  /**
   * Vérifie si un changement de statut nécessite une action
   */
  shouldTriggerNotification(oldStatus: string, newStatus: NormalizedStatus): boolean {
    // Toujours notifier si c'est un changement significatif
    return this.isSignificantChange(oldStatus, newStatus);
  }

  /**
   * Détermine le type de notification à envoyer
   */
  getNotificationType(status: NormalizedStatus): 'public' | 'dm' | 'none' {
    switch (status) {
      case 'Indisponible matériel':
        return 'public';
      case 'Disponible':
        return 'dm';
      default:
        return 'none';
    }
  }

  /**
   * Vérifie si le changement est significatif
   */
  isSignificantChange(oldStatus: string, newStatus: NormalizedStatus): boolean {
    // Pas de changement si c'est le même statut
    if (oldStatus === newStatus) {
      return false;
    }

    // Changement significatif si on passe à "Disponible" ou "Indisponible matériel"
    const significantStatuses: NormalizedStatus[] = ['Disponible', 'Indisponible matériel'];
    
    return significantStatuses.includes(newStatus);
  }

  /**
   * Vérifie si un statut nécessite une notification publique immédiate
   */
  requiresImmediatePublicNotification(status: NormalizedStatus): boolean {
    return status === 'Indisponible matériel';
  }

  /**
   * Vérifie si un statut nécessite une notification MP
   */
  requiresDMNotification(status: NormalizedStatus): boolean {
    return status === 'Disponible';
  }

  /**
   * Détermine la priorité d'une notification
   */
  getNotificationPriority(status: NormalizedStatus): 'high' | 'medium' | 'low' {
    switch (status) {
      case 'Indisponible matériel':
        return 'high';
      case 'Disponible':
        return 'medium';
      case 'En intervention':
        return 'medium';
      case 'Hors service':
        return 'low';
      default:
        return 'low';
    }
  }

  /**
   * Vérifie si un statut indique un problème critique
   */
  isCriticalStatus(status: NormalizedStatus): boolean {
    return status === 'Indisponible matériel' || status === 'Hors service';
  }

  /**
   * Vérifie si un statut indique une disponibilité
   */
  isAvailableStatus(status: NormalizedStatus): boolean {
    return status === 'Disponible';
  }

  /**
   * Vérifie si un statut indique une intervention en cours
   */
  isInterventionStatus(status: NormalizedStatus): boolean {
    return status === 'En intervention' || status === 'Retour service';
  }

  /**
   * Vérifie si un statut indique une maintenance
   */
  isMaintenanceStatus(status: NormalizedStatus): boolean {
    return status === 'Désinfection en cours' || status === 'Indisponible opérationnel';
  }
}

/**
 * Instance globale des règles
 */
export const vehicleRules = new VehicleChangeRules();
