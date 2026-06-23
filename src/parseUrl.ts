import type { ParsedGoogleFontsUrl } from "./types.js";

const GOOGLE_FONTS_HOSTS = new Set(["fonts.googleapis.com", "www.fonts.googleapis.com"]);

export class InvalidGoogleFontsUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGoogleFontsUrlError";
  }
}

function isGoogleFontsCssPath(pathname: string): boolean {
  return pathname === "/css" || pathname === "/css2";
}

function decodeFamilyName(value: string): string {
  return value.trim().replace(/\+/g, " ");
}

function extractFamiliesFromParam(value: string): string[] {
  return value
    .split("|")
    .map((spec) => decodeFamilyName(spec.split(":")[0] ?? ""))
    .filter(Boolean);
}

function extractFamilies(searchParams: URLSearchParams): string[] {
  const families: string[] = [];

  for (const [key, value] of searchParams.entries()) {
    if (key === "family") {
      families.push(...extractFamiliesFromParam(value));
    }
  }

  return families;
}

function extractRequestedSubsets(searchParams: URLSearchParams): string[] | null {
  const subsetParam = searchParams.get("subset") ?? searchParams.get("subsets");
  if (!subsetParam) {
    return null;
  }

  const subsets = subsetParam
    .split(",")
    .map((subset) => subset.trim())
    .filter(Boolean);

  return subsets.length > 0 ? subsets : null;
}

export function parseGoogleFontsUrl(input: string): ParsedGoogleFontsUrl {
  let parsed: URL;

  try {
    parsed = new URL(input.trim());
  } catch {
    throw new InvalidGoogleFontsUrlError("Input must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new InvalidGoogleFontsUrlError("Google Fonts URL must use https.");
  }

  if (!GOOGLE_FONTS_HOSTS.has(parsed.hostname)) {
    throw new InvalidGoogleFontsUrlError(
      "URL must point to fonts.googleapis.com (e.g. https://fonts.googleapis.com/css2?...)."
    );
  }

  if (!isGoogleFontsCssPath(parsed.pathname)) {
    throw new InvalidGoogleFontsUrlError("URL path must be /css or /css2.");
  }

  const families = extractFamilies(parsed.searchParams);
  if (families.length === 0) {
    throw new InvalidGoogleFontsUrlError("No font families found in the URL.");
  }

  return {
    url: parsed.toString(),
    families,
    requestedSubsets: extractRequestedSubsets(parsed.searchParams),
  };
}

export function shouldIncludeSubset(subset: string, allowedSubsets: string[] | null): boolean {
  if (!allowedSubsets || allowedSubsets.length === 0) {
    return true;
  }

  return allowedSubsets.includes(subset);
}
