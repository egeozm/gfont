const GOOGLE_FONTS_HOSTS = new Set(["fonts.googleapis.com", "www.fonts.googleapis.com"]);

const GOOGLE_FONTS_CSS_PATHS = new Set(["/css", "/css2"]);

export function stripCssUrl(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function normalizeProtocolRelativeUrl(url: string, baseUrl?: string): string {
  const trimmed = url.trim();

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (baseUrl) {
    return new URL(trimmed, baseUrl).toString();
  }

  return trimmed;
}

export function isGoogleFontsCssApiUrl(input: string): boolean {
  try {
    const normalized = normalizeProtocolRelativeUrl(input);
    const parsed = new URL(normalized);

    if (parsed.protocol !== "https:") {
      return false;
    }

    if (!GOOGLE_FONTS_HOSTS.has(parsed.hostname)) {
      return false;
    }

    return GOOGLE_FONTS_CSS_PATHS.has(parsed.pathname);
  } catch {
    return false;
  }
}

export function normalizeGoogleFontsCssUrl(input: string): string | null {
  try {
    const normalized = normalizeProtocolRelativeUrl(stripCssUrl(input));
    if (!isGoogleFontsCssApiUrl(normalized)) {
      return null;
    }

    const parsed = new URL(normalized);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveUrlAgainstBase(input: string, baseUrl: string): string | null {
  try {
    const trimmed = stripCssUrl(input);
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
      return null;
    }

    return normalizeProtocolRelativeUrl(trimmed, baseUrl);
  } catch {
    return null;
  }
}

export function isDirectFontBinaryUrl(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.includes(".woff2") ||
    lower.includes(".woff") ||
    lower.includes(".ttf") ||
    lower.includes(".otf") ||
    lower.includes(".eot")
  );
}

export function isGoogleFontsWebsiteUrl(input: string): boolean {
  try {
    const parsed = new URL(input.trim());
    return GOOGLE_FONTS_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isGoogleFontsStaticUrl(input: string): boolean {
  try {
    const parsed = new URL(normalizeProtocolRelativeUrl(input));
    return parsed.hostname === "fonts.gstatic.com";
  } catch {
    return false;
  }
}

export function dedupeGoogleFontsCssUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const normalized = normalizeGoogleFontsCssUrl(url);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
