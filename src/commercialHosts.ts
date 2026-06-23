export interface CommercialHostMatch {
  provider: string;
  evidence: string;
}

const COMMERCIAL_HOST_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /use\.typekit\.net/i, provider: "Adobe Fonts (Typekit)" },
  { pattern: /p\.typekit\.net/i, provider: "Adobe Fonts (Typekit)" },
  { pattern: /fast\.fonts\.net/i, provider: "Monotype Fonts.com" },
  { pattern: /fonts\.com/i, provider: "Monotype Fonts.com" },
  { pattern: /cloud\.typography\.com/i, provider: "Hoefler Cloud Typography" },
  { pattern: /hello\.myfonts\.net/i, provider: "MyFonts" },
  { pattern: /webfonts\.fontshop\.com/i, provider: "FontShop" },
  { pattern: /fonts\.adobe\.com/i, provider: "Adobe Fonts" },
  { pattern: /kit\.fontawesome\.com/i, provider: "Font Awesome Pro Kit" },
];

const COMMERCIAL_FILENAME_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /fa-light-\d+/i, provider: "Font Awesome Pro (Light)" },
  { pattern: /fa-thin-\d+/i, provider: "Font Awesome Pro (Thin)" },
  { pattern: /fa-duotone/i, provider: "Font Awesome Pro (Duotone)" },
  { pattern: /fa-sharp/i, provider: "Font Awesome Pro (Sharp)" },
  { pattern: /fa-pro/i, provider: "Font Awesome Pro" },
  { pattern: /fontawesome-pro/i, provider: "Font Awesome Pro" },
];

export function matchCommercialHost(sourceUrl: string, family?: string): CommercialHostMatch | null {
  for (const entry of COMMERCIAL_HOST_PATTERNS) {
    if (entry.pattern.test(sourceUrl)) {
      return {
        provider: entry.provider,
        evidence: `Font source URL matches commercial provider ${entry.provider}.`,
      };
    }
  }

  const haystack = `${sourceUrl} ${family ?? ""}`;
  for (const entry of COMMERCIAL_FILENAME_PATTERNS) {
    if (entry.pattern.test(haystack)) {
      return {
        provider: entry.provider,
        evidence: `Font filename or family matches ${entry.provider}.`,
      };
    }
  }

  return null;
}
