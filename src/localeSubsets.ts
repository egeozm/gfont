const LANGUAGE_SUBSET_MAP: Record<string, string[]> = {
  tr: ["latin", "latin-ext"],
  en: ["latin", "latin-ext"],
  de: ["latin", "latin-ext"],
  fr: ["latin", "latin-ext"],
  es: ["latin", "latin-ext"],
  it: ["latin", "latin-ext"],
  pt: ["latin", "latin-ext"],
  nl: ["latin", "latin-ext"],
  pl: ["latin", "latin-ext"],
  sv: ["latin", "latin-ext"],
  da: ["latin", "latin-ext"],
  fi: ["latin", "latin-ext"],
  no: ["latin", "latin-ext"],
  cs: ["latin", "latin-ext"],
  ro: ["latin", "latin-ext"],
  hu: ["latin", "latin-ext"],
  el: ["latin", "greek", "greek-ext", "latin-ext"],
  ru: ["latin", "cyrillic", "cyrillic-ext", "latin-ext"],
  uk: ["latin", "cyrillic", "cyrillic-ext", "latin-ext"],
  bg: ["latin", "cyrillic", "cyrillic-ext", "latin-ext"],
  he: ["latin", "hebrew", "latin-ext"],
  vi: ["latin", "latin-ext", "vietnamese"],
};

const DEFAULT_SUBSETS = ["latin", "latin-ext"];

export function normalizePageLang(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  return trimmed.split(/[-_]/)[0] ?? null;
}

export function getRecommendedSubsetsForLang(lang: string | null | undefined): string[] {
  const normalized = normalizePageLang(lang);
  if (!normalized) {
    return [...DEFAULT_SUBSETS];
  }

  return [...(LANGUAGE_SUBSET_MAP[normalized] ?? DEFAULT_SUBSETS)];
}

export function extractPageLangFromHtml(html: string): string | null {
  const htmlTagMatch = html.match(/<html\b[^>]*\blang\s*=\s*(['"])(.*?)\1/i);
  if (htmlTagMatch?.[2]) {
    return htmlTagMatch[2].trim();
  }

  const metaMatch = html.match(
    /<meta\b[^>]*\bhttp-equiv\s*=\s*(['"])content-language\1[^>]*\bcontent\s*=\s*(['"])(.*?)\2/i
  );
  if (metaMatch?.[3]) {
    return metaMatch[3].trim();
  }

  const metaLangMatch = html.match(/<meta\b[^>]*\bname\s*=\s*(['"])language\1[^>]*\bcontent\s*=\s*(['"])(.*?)\2/i);
  if (metaLangMatch?.[3]) {
    return metaLangMatch[3].trim();
  }

  return null;
}
