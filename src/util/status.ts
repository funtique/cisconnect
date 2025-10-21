/**
 * Normalise les statuts de véhicules selon les règles métier
 */

export type NormalizedStatus =
  | 'Disponible'
  | 'Indisponible matériel'
  | 'Indisponible opérationnel'
  | 'Désinfection en cours'
  | 'En intervention'
  | 'Retour service'
  | 'Hors service';

// Mapping des statuts avec alias et normalisation
const STATUS_MAPPING: Record<string, NormalizedStatus> = {
  // Disponible
  'disponible': 'Disponible',
  'libre': 'Disponible',
  'en service': 'Disponible',
  'prêt': 'Disponible',

  // Indisponible matériel
  'indisponible matériel': 'Indisponible matériel',
  'indispo mat': 'Indisponible matériel',
  'indispo mat.': 'Indisponible matériel',
  'indisponible mat': 'Indisponible matériel',
  'indisponible mat.': 'Indisponible matériel',
  'panne': 'Indisponible matériel',
  'maintenance': 'Indisponible matériel',
  'réparation': 'Indisponible matériel',

  // Indisponible opérationnel
  'indisponible opérationnel': 'Indisponible opérationnel',
  'indispo op': 'Indisponible opérationnel',
  'indispo op.': 'Indisponible opérationnel',
  'indisponible op': 'Indisponible opérationnel',
  'indisponible op.': 'Indisponible opérationnel',
  'hors service op': 'Indisponible opérationnel',
  'hors service op.': 'Indisponible opérationnel',

  // Désinfection en cours
  'désinfection en cours': 'Désinfection en cours',
  'désinfection': 'Désinfection en cours',
  'nettoyage': 'Désinfection en cours',
  'désinfect': 'Désinfection en cours',

  // En intervention
  'en intervention': 'En intervention',
  'intervention': 'En intervention',
  'mission': 'En intervention',
  'sortie': 'En intervention',
  'départ': 'En intervention',

  // Retour service
  'retour service': 'Retour service',
  'retour': 'Retour service',
  'retour de mission': 'Retour service',
  'retour intervention': 'Retour service',

  // Hors service
  'hors service': 'Hors service',
  'hors ligne': 'Hors service',
  'arrêt': 'Hors service',
  'arrêté': 'Hors service'
};

/**
 * Normalise un statut de véhicule
 */
export function normalizeStatus(rawStatus: string): NormalizedStatus {
  if (!rawStatus || typeof rawStatus !== 'string') {
    return 'Hors service';
  }

  // Nettoyage et normalisation
  const cleaned = rawStatus
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[^\w\s]/g, '') // Supprime la ponctuation
    .replace(/\s+/g, ' '); // Normalise les espaces

  // Recherche exacte
  if (STATUS_MAPPING[cleaned]) {
    return STATUS_MAPPING[cleaned];
  }

  // Recherche partielle pour les cas complexes
  for (const [pattern, status] of Object.entries(STATUS_MAPPING)) {
    if (cleaned.includes(pattern) || pattern.includes(cleaned)) {
      return status;
    }
  }

  // Par défaut si aucun mapping trouvé
  return 'Hors service';
}

/**
 * Vérifie si un statut nécessite une notification publique
 */
export function requiresPublicNotification(status: NormalizedStatus): boolean {
  return status === 'Indisponible matériel';
}

/**
 * Vérifie si un statut nécessite une notification MP
 */
export function requiresDMNotification(status: NormalizedStatus): boolean {
  return status === 'Disponible';
}

/**
 * Obtient l'emoji correspondant au statut
 */
export function getStatusEmoji(status: NormalizedStatus): string {
  const emojiMap: Record<NormalizedStatus, string> = {
    'Disponible': '✅',
    'Indisponible matériel': '🔧',
    'Indisponible opérationnel': '⚠️',
    'Désinfection en cours': '🧽',
    'En intervention': '🚨',
    'Retour service': '🔄',
    'Hors service': '❌'
  };

  return emojiMap[status] || '❓';
}

/**
 * Obtient la couleur correspondant au statut (pour les embeds Discord)
 */
export function getStatusColor(status: NormalizedStatus): number {
  const colorMap: Record<NormalizedStatus, number> = {
    'Disponible': 0x00ff00, // Vert
    'Indisponible matériel': 0xff0000, // Rouge
    'Indisponible opérationnel': 0xffa500, // Orange
    'Désinfection en cours': 0x00bfff, // Bleu clair
    'En intervention': 0xff4500, // Rouge orange
    'Retour service': 0xffff00, // Jaune
    'Hors service': 0x808080 // Gris
  };

  return colorMap[status] || 0x808080;
}
