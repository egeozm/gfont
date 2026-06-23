import type { FontLicenseStatus } from "./types.js";

export interface FoundryMatch {
  status: FontLicenseStatus;
  foundry: string;
  evidence: string;
}

const COMMERCIAL_VENDOR_IDS: Record<string, string> = {
  ADBE: "Adobe",
  MONA: "Monotype",
  MONB: "Monotype",
  MONT: "Monotype Imaging",
  LINO: "Linotype",
  HFCO: "Hoefler & Co.",
  TYPO: "Commercial Type",
  FNTS: "Fontsmith",
  MYFO: "MyFonts",
  FSPR: "Fontspring",
  FNTA: "Font Bureau",
  ITFO: "ITC",
  BERT: "Berthold",
  URW: "URW Type Foundry",
  FONT: "FontFont",
};

const LIBRE_VENDOR_IDS: Record<string, string> = {
  GOOG: "Google",
  SIL: "SIL International",
  DEJA: "DejaVu",
  LIBE: "Liberation Fonts",
};

const COMMERCIAL_STRING_MARKERS: Array<{ pattern: RegExp; foundry: string }> = [
  { pattern: /monotype/i, foundry: "Monotype" },
  { pattern: /linotype/i, foundry: "Linotype" },
  { pattern: /adobe systems/i, foundry: "Adobe" },
  { pattern: /hoefler/i, foundry: "Hoefler & Co." },
  { pattern: /font awesome pro/i, foundry: "Font Awesome Pro" },
  { pattern: /fontsmith/i, foundry: "Fontsmith" },
  { pattern: /commercial type/i, foundry: "Commercial Type" },
  { pattern: /fonts\.com/i, foundry: "Fonts.com" },
  { pattern: /myfonts/i, foundry: "MyFonts" },
  { pattern: /fontspring/i, foundry: "Fontspring" },
  { pattern: /font bureau/i, foundry: "Font Bureau" },
  { pattern: /fontfont/i, foundry: "FontFont" },
  { pattern: /itc\b/i, foundry: "ITC" },
  { pattern: /berthold/i, foundry: "Berthold" },
];

const LIBRE_STRING_MARKERS: Array<{ pattern: RegExp; foundry: string }> = [
  { pattern: /google/i, foundry: "Google" },
  { pattern: /sil international/i, foundry: "SIL International" },
  { pattern: /dejavu/i, foundry: "DejaVu" },
  { pattern: /liberation/i, foundry: "Liberation Fonts" },
  { pattern: /font awesome free/i, foundry: "Font Awesome Free" },
];

export function matchFoundryFromMetadata(input: {
  vendorId?: string;
  copyright?: string;
  manufacturer?: string;
  designer?: string;
}): FoundryMatch | null {
  const vendorId = input.vendorId?.trim().toUpperCase();
  if (vendorId && COMMERCIAL_VENDOR_IDS[vendorId]) {
    const foundry = COMMERCIAL_VENDOR_IDS[vendorId]!;
    return {
      status: "restricted",
      foundry,
      evidence: `OS/2 vendor ID "${vendorId}" maps to commercial foundry ${foundry}.`,
    };
  }

  if (vendorId && LIBRE_VENDOR_IDS[vendorId]) {
    const foundry = LIBRE_VENDOR_IDS[vendorId]!;
    return {
      status: "free",
      foundry,
      evidence: `OS/2 vendor ID "${vendorId}" maps to open-source foundry ${foundry}.`,
    };
  }

  const combined = [input.copyright, input.manufacturer, input.designer].filter(Boolean).join(" | ");
  if (!combined) return null;

  for (const marker of COMMERCIAL_STRING_MARKERS) {
    if (marker.pattern.test(combined)) {
      return {
        status: "restricted",
        foundry: marker.foundry,
        evidence: `Copyright/manufacturer metadata references ${marker.foundry}.`,
      };
    }
  }

  for (const marker of LIBRE_STRING_MARKERS) {
    if (marker.pattern.test(combined)) {
      return {
        status: "free",
        foundry: marker.foundry,
        evidence: `Copyright/manufacturer metadata references ${marker.foundry}.`,
      };
    }
  }

  return null;
}
