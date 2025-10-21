import { describe, it, expect } from 'vitest';
import { 
  normalizeStatus, 
  requiresPublicNotification, 
  requiresDMNotification,
  getStatusEmoji,
  getStatusColor,
  type NormalizedStatus 
} from './status.js';

describe('Status normalization', () => {
  it('should normalize "disponible" to "Disponible"', () => {
    expect(normalizeStatus('disponible')).toBe('Disponible');
  });

  it('should normalize "indispo mat" to "Indisponible matériel"', () => {
    expect(normalizeStatus('indispo mat')).toBe('Indisponible matériel');
  });

  it('should normalize "en intervention" to "En intervention"', () => {
    expect(normalizeStatus('en intervention')).toBe('En intervention');
  });

  it('should handle case insensitive input', () => {
    expect(normalizeStatus('DISPONIBLE')).toBe('Disponible');
    expect(normalizeStatus('Indispo Mat.')).toBe('Indisponible matériel');
  });

  it('should handle accents', () => {
    expect(normalizeStatus('désinfection')).toBe('Désinfection en cours');
    expect(normalizeStatus('indisponible opérationnel')).toBe('Indisponible opérationnel');
  });

  it('should return "Hors service" for unknown status', () => {
    expect(normalizeStatus('unknown status')).toBe('Hors service');
    expect(normalizeStatus('')).toBe('Hors service');
  });
});

describe('Notification requirements', () => {
  it('should require public notification for "Indisponible matériel"', () => {
    expect(requiresPublicNotification('Indisponible matériel')).toBe(true);
  });

  it('should not require public notification for other statuses', () => {
    expect(requiresPublicNotification('Disponible')).toBe(false);
    expect(requiresPublicNotification('En intervention')).toBe(false);
    expect(requiresPublicNotification('Hors service')).toBe(false);
  });

  it('should require DM notification for "Disponible"', () => {
    expect(requiresDMNotification('Disponible')).toBe(true);
  });

  it('should not require DM notification for other statuses', () => {
    expect(requiresDMNotification('Indisponible matériel')).toBe(false);
    expect(requiresDMNotification('En intervention')).toBe(false);
    expect(requiresDMNotification('Hors service')).toBe(false);
  });
});

describe('Status emojis', () => {
  it('should return correct emojis for each status', () => {
    expect(getStatusEmoji('Disponible')).toBe('✅');
    expect(getStatusEmoji('Indisponible matériel')).toBe('🔧');
    expect(getStatusEmoji('En intervention')).toBe('🚨');
    expect(getStatusEmoji('Hors service')).toBe('❌');
  });
});

describe('Status colors', () => {
  it('should return correct colors for each status', () => {
    expect(getStatusColor('Disponible')).toBe(0x00ff00); // Vert
    expect(getStatusColor('Indisponible matériel')).toBe(0xff0000); // Rouge
    expect(getStatusColor('En intervention')).toBe(0xff4500); // Rouge orange
    expect(getStatusColor('Hors service')).toBe(0x808080); // Gris
  });
});
