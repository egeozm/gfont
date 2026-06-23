import { fetchTextWithTimeout } from "./fetchUtils.js";

export const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";
const METADATA_URL = GOOGLE_FONTS_METADATA_URL;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

interface GoogleFontMetadataEntry {
  family: string;
  license?: string;
}

interface GoogleFontMetadataResponse {
  familyMetadataList?: GoogleFontMetadataEntry[];
}

let cachedMetadata: Map<string, string> | null = null;
let cacheLoadedAt = 0;

function normalizeFamilyName(value: string): string {
  return value.trim().toLowerCase();
}

function parseMetadataPayload(text: string): Map<string, string> {
  const cleaned = text.replace(/^\)\]\}'\n?/, "");
  const parsed = JSON.parse(cleaned) as GoogleFontMetadataResponse;
  const map = new Map<string, string>();

  for (const entry of parsed.familyMetadataList ?? []) {
    if (!entry.family || !entry.license) continue;
    map.set(normalizeFamilyName(entry.family), entry.license);
  }

  return map;
}

export async function getGoogleFontsLicenseMap(): Promise<Map<string, string> | null> {
  if (cachedMetadata && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedMetadata;
  }

  try {
    const text = await fetchTextWithTimeout(METADATA_URL, {
      accept: "application/json,text/plain,*/*",
      timeoutMs: 15_000,
    });
    cachedMetadata = parseMetadataPayload(text);
    cacheLoadedAt = Date.now();
    return cachedMetadata;
  } catch {
    return cachedMetadata;
  }
}

export async function lookupGoogleFontsLicense(family: string): Promise<string | null> {
  const map = await getGoogleFontsLicenseMap();
  if (!map) return null;
  return map.get(normalizeFamilyName(family)) ?? null;
}

export function buildGoogleFontsSpecimenUrl(family: string): string {
  const slug = family.trim().replace(/\s+/g, "+");
  return `https://fonts.google.com/specimen/${encodeURIComponent(slug).replace(/%2B/g, "+")}`;
}
