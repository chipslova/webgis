import { describe, it, expect, beforeEach } from 'vitest';
import { escapeHtml, sanitizeAttribute } from '../src/utils/sanitize';
import { PermalinkManager } from '../src/tools/permalink';

describe('Security & XSS Sanitization Utilities', () => {
  it('should escape dangerous HTML script tags and angle brackets', () => {
    const maliciousInput = '<script>alert("XSS")</script>';
    const sanitized = escapeHtml(maliciousInput);
    expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
  });

  it('should escape malicious image onerror payloads in GeoJSON layer names', () => {
    const maliciousFilename = '<img src=x onerror=alert(document.domain)>.geojson';
    const sanitized = escapeHtml(maliciousFilename);
    expect(sanitized).toBe('&lt;img src=x onerror=alert(document.domain)&gt;.geojson');
  });

  it('should escape quotes, single quotes, and ampersands in attributes', () => {
    const payload = `Tom & Jerry's "Adventure"`;
    expect(sanitizeAttribute(payload)).toBe(`Tom &amp; Jerry&#039;s &quot;Adventure&quot;`);
  });

  it('should handle null, undefined, and numbers safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12345)).toBe('12345');
  });
});

describe('Saved Projects (LocalStorage Persistence)', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; }
    };
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;
  });

  it('should return empty array when no projects are saved', () => {
    expect(PermalinkManager.getSavedProjects()).toEqual([]);
  });

  it('should correctly delete saved projects by ID', () => {
    const mockProjects = [
      {
        id: 'proj-1',
        name: 'IKN Nusantara',
        timestamp: 1000,
        dateFormatted: '1 Jan 2025',
        hash: '#map=10/-0.97/116.7'
      },
      {
        id: 'proj-2',
        name: 'Bromo Thermal',
        timestamp: 2000,
        dateFormatted: '2 Jan 2025',
        hash: '#map=11/-7.94/112.95'
      }
    ];

    localStorage.setItem('webgis_saved_projects', JSON.stringify(mockProjects));
    expect(PermalinkManager.getSavedProjects().length).toBe(2);

    const deleted = PermalinkManager.deleteSavedProject('proj-1');
    expect(deleted).toBe(true);

    const remaining = PermalinkManager.getSavedProjects();
    expect(remaining.length).toBe(1);
    expect(remaining[0].name).toBe('Bromo Thermal');
  });
});
