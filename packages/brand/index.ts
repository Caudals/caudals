import manifest from "./manifest.json";

export const caudalsBrand = manifest;
export type CaudalsBrandManifest = typeof caudalsBrand;

export const caudalsBrandCssVariables = {
  "--ds-canvas": manifest.tokens.canvas,
  "--ds-surface": manifest.tokens.surface,
  "--ds-text-primary": manifest.tokens.textPrimary,
  "--ds-text-secondary": manifest.tokens.textSecondary,
  "--ds-accent": manifest.tokens.accent,
  "--ds-accent-teal": manifest.tokens.accentTeal,
  "--ds-cta-bg": manifest.tokens.ctaBackground,
  "--ds-radius-lg": manifest.tokens.radiusLarge,
  "--ds-radius-xl": manifest.tokens.radiusExtraLarge,
} as const;
