/**
 * Utilitaires pour le jitter dans le polling
 */

/**
 * Génère un délai aléatoire avec jitter pour éviter la synchronisation des requêtes
 * @param baseDelay Délai de base en millisecondes
 * @param jitterPercent Pourcentage de jitter (0-100)
 * @returns Délai avec jitter appliqué
 */
export function addJitter(baseDelay: number, jitterPercent: number = 10): number {
  const jitterRange = (baseDelay * jitterPercent) / 100;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange; // -jitterRange à +jitterRange
  return Math.max(1000, baseDelay + jitter); // Minimum 1 seconde
}

/**
 * Calcule le prochain délai de polling avec jitter
 * @param pollingSec Intervalle de polling en secondes
 * @returns Délai en millisecondes avec jitter
 */
export function getNextPollingDelay(pollingSec: number): number {
  const baseDelay = pollingSec * 1000;
  return addJitter(baseDelay, 15); // 15% de jitter par défaut
}

/**
 * Génère un délai d'attente aléatoire pour le démarrage
 * Évite que tous les serveurs démarrent en même temps
 * @param maxDelayMs Délai maximum en millisecondes
 * @returns Délai aléatoire
 */
export function getRandomStartupDelay(maxDelayMs: number = 30000): number {
  return Math.random() * maxDelayMs;
}
