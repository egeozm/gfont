import { getGoogleFontsLicenseMap } from "./googleFontsMetadata.js";

const EXTRA_OPEN_FONTS = [
  "DejaVu Sans",
  "DejaVu Serif",
  "DejaVu Sans Mono",
  "Liberation Sans",
  "Liberation Serif",
  "Liberation Mono",
  "Font Awesome Free",
  "Font Awesome 5 Free",
  "Font Awesome 6 Free",
  "Inter",
  "Source Sans Pro",
  "Source Serif Pro",
  "Source Code Pro",
  "Noto Sans",
  "Noto Serif",
];

function normalizeFamilyName(value: string): string {
  return value.trim().toLowerCase();
}

let cachedOpenFontNames: Set<string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export async function getKnownOpenFontNames(): Promise<Set<string>> {
  if (cachedOpenFontNames && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedOpenFontNames;
  }

  const names = new Set<string>();
  for (const family of EXTRA_OPEN_FONTS) {
    names.add(normalizeFamilyName(family));
  }

  const googleMap = await getGoogleFontsLicenseMap();
  if (googleMap) {
    for (const family of googleMap.keys()) {
      names.add(family);
    }
  }

  cachedOpenFontNames = names;
  cacheLoadedAt = Date.now();
  return names;
}

export async function matchKnownOpenFontName(family: string): Promise<{
  matchedFamily: string;
  evidence: string;
} | null> {
  const normalized = normalizeFamilyName(family);
  const registry = await getKnownOpenFontNames();

  if (registry.has(normalized)) {
    return {
      matchedFamily: family,
      evidence: `Family name "${family}" matches a known open-source font registry entry (name match only).`,
    };
  }

  return null;
}
