import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

function themeColors(): Record<string, string> {
  const theme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  return Object.fromEntries(
    [...theme.matchAll(/--color-([\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]),
  );
}

function relativeLuminance(hex: string): number {
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset + 1, offset + 3), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function color(name: string): string {
  const value = themeColors()[name];
  if (!value) throw new Error(`Missing CSS theme color: ${name}`);
  return value;
}

describe('CSS colour regression guard', () => {
  it('exposes the semantic colour contract used by components', () => {
    const required = [
      'canvas', 'panel', 'surface', 'chip', 'line', 'fg', 'fg-muted', 'fg-dim', 'fg-subtle',
      'accent', 'accent-soft', 'accent-strong', 'accent-text',
      'primary', 'primary-hover', 'on-primary',
      'brand-rose', 'brand-emerald', 'brand-rose-surface', 'brand-emerald-surface',
      'success', 'warning', 'danger', 'info',
      'success-surface', 'warning-surface', 'danger-surface', 'info-surface',
      'success-border', 'warning-border', 'danger-border', 'info-border',
    ];

    for (const token of required) expect(themeColors()).toHaveProperty(token);
  });

  it('keeps every normal text tier readable across the dark elevation ladder', () => {
    const surfaces = ['canvas', 'panel', 'surface', 'chip'];
    const foregrounds = ['fg', 'fg-muted', 'fg-dim', 'fg-subtle', 'accent-text'];

    for (const foreground of foregrounds) {
      for (const surface of surfaces) {
        expect(
          contrast(color(foreground), color(surface)),
          `${foreground} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps primary action text readable on its fill and hover fill', () => {
     expect(color('accent')).toBe('#574D3C');
     expect(color('primary')).toBe('#574D3C');
     expect(color('on-primary')).toBe('#E6E5E4');
    expect(contrast(color('fg'), color('accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('on-primary'), color('primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('on-primary'), color('primary-hover'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps default, hover, and focus borders distinguishable on filled surfaces', () => {
    const surfaces = ['canvas', 'panel', 'surface', 'chip'];
    for (const border of ['line', 'accent-soft', 'accent-text']) {
      for (const surface of surfaces) {
        expect(
          contrast(color(border), color(surface)),
          `${border} on ${surface}`,
        ).toBeGreaterThanOrEqual(border === 'line' ? 1.2 : border === 'accent-soft' ? 2.5 : 3);
      }
    }
  });

  it('keeps decorative rose and emerald pairings readable on dark surfaces', () => {
    const darkSurfaces = ['canvas', 'panel', 'surface', 'chip'];
    const pairings = [
      ['brand-rose', 'brand-rose-surface'],
      ['brand-emerald', 'brand-emerald-surface'],
    ] as const;

    for (const [foreground, tintedSurface] of pairings) {
      for (const surface of darkSurfaces) {
        expect(
          contrast(color(foreground), color(surface)),
          `${foreground} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(color(foreground), color(tintedSurface)),
        `${foreground} on ${tintedSurface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps status foregrounds readable on dark surfaces and their tinted surfaces', () => {
    const darkSurfaces = ['canvas', 'panel', 'surface', 'chip'];
    for (const status of ['success', 'warning', 'danger', 'info']) {
      for (const surface of darkSurfaces) {
        expect(
          contrast(color(status), color(surface)),
          `${status} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(color(status), color(`${status}-surface`)),
        `${status} on ${status}-surface`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps status borders distinguishable from their tinted surfaces', () => {
    for (const status of ['success', 'warning', 'danger', 'info']) {
      expect(
        contrast(color(`${status}-border`), color(`${status}-surface`)),
        `${status}-border on ${status}-surface`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
