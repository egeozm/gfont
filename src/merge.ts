import type { FontFormat, FontVariant, MergedFontVariant } from "./types.js";

function variantKey(variant: Pick<FontVariant, "family" | "style" | "weight" | "subset">): string {
  return `${variant.family}|${variant.style}|${variant.weight}|${variant.subset}`;
}

export function mergeFontVariants(variants: FontVariant[]): MergedFontVariant[] {
  const merged = new Map<string, MergedFontVariant>();

  for (const variant of variants) {
    const key = variantKey(variant);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        family: variant.family,
        style: variant.style,
        weight: variant.weight,
        subset: variant.subset,
        fontDisplay: variant.fontDisplay,
        unicodeRange: variant.unicodeRange,
        sources: {
          [variant.format]: variant.srcUrl,
        },
      });
      continue;
    }

    existing.sources[variant.format] = variant.srcUrl;

    if (!existing.fontDisplay && variant.fontDisplay) {
      existing.fontDisplay = variant.fontDisplay;
    }

    if (!existing.unicodeRange && variant.unicodeRange) {
      existing.unicodeRange = variant.unicodeRange;
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const familyCompare = a.family.localeCompare(b.family);
    if (familyCompare !== 0) return familyCompare;

    const subsetCompare = a.subset.localeCompare(b.subset);
    if (subsetCompare !== 0) return subsetCompare;

    const weightCompare = a.weight - b.weight;
    if (weightCompare !== 0) return weightCompare;

    return a.style.localeCompare(b.style);
  });
}

export function filterMergedVariantsByFormats(
  variants: MergedFontVariant[],
  formats: FontFormat[]
): MergedFontVariant[] {
  return variants
    .map((variant) => {
      const sources: Partial<Record<FontFormat, string>> = {};
      for (const format of formats) {
        const url = variant.sources[format];
        if (url) {
          sources[format] = url;
        }
      }

      return {
        ...variant,
        sources,
      };
    })
    .filter((variant) => Object.keys(variant.sources).length > 0);
}

function variantIdentity(
  variant: Pick<MergedFontVariant, "family" | "style" | "weight">
): string {
  return `${variant.family}|${variant.style}|${variant.weight}`;
}

/**
 * Google Fonts css2 serves woff/ttf only as legacy fallbacks without subset
 * comments. Attach those aggregate sources to each subset-specific variant.
 */
export function enrichWithLegacyFallbacks(variants: MergedFontVariant[]): MergedFontVariant[] {
  const legacyByIdentity = new Map<string, MergedFontVariant>();

  for (const variant of variants) {
    if (variant.subset === "unknown") {
      legacyByIdentity.set(variantIdentity(variant), variant);
    }
  }

  const enriched = variants
    .filter((variant) => variant.subset !== "unknown")
    .map((variant) => {
      const legacy = legacyByIdentity.get(variantIdentity(variant));
      if (!legacy) {
        return variant;
      }

      return {
        ...variant,
        sources: {
          ...variant.sources,
          ...(legacy.sources.woff ? { woff: legacy.sources.woff } : {}),
          ...(legacy.sources.ttf ? { ttf: legacy.sources.ttf } : {}),
        },
      };
    });

  if (enriched.length > 0) {
    return enriched;
  }

  return variants.filter((variant) => variant.subset !== "unknown");
}
