/**
 * Known paid / commercial fonts — matched by family name before AI or fallback.
 * Sourced from Mark Simonson Studio and similar commercial catalogs.
 */
const KNOWN_PAID_FONTS: Array<{ name: string; foundry?: string }> = [
  // Commercial catalog (image 1)
  { name: "Elzevir", foundry: "Mark Simonson Studio" },
  { name: "Energy Sans", foundry: "Mark Simonson Studio" },
  { name: "Essence", foundry: "Mark Simonson Studio" },
  { name: "Grange", foundry: "Mark Simonson Studio" },
  { name: "Heh Script", foundry: "Mark Simonson Studio" },
  { name: "Neo Grotesk", foundry: "Mark Simonson Studio" },
  { name: "Painter Script", foundry: "Mark Simonson Studio" },
  { name: "Prefab Script", foundry: "Mark Simonson Studio" },
  { name: "Proxima Nova Wide", foundry: "Mark Davis / Font Bureau" },
  { name: "Proxima Serif", foundry: "Mark Davis / Font Bureau" },
  { name: "Proxima Slab", foundry: "Mark Davis / Font Bureau" },
  { name: "Rational Script", foundry: "Mark Simonson Studio" },
  { name: "Renault", foundry: "Custom / brand font" },
  // Commercial catalog (image 2)
  { name: "Blakely", foundry: "Mark Simonson Studio" },
  { name: "Bookmania", foundry: "Mark Simonson Studio" },
  { name: "Changeling Neo", foundry: "Mark Simonson Studio" },
  { name: "Coquette", foundry: "Mark Simonson Studio" },
  { name: "Etna", foundry: "Mark Simonson Studio" },
  { name: "Felt Tip Roman", foundry: "Mark Simonson Studio" },
  { name: "Felt Tip Senior", foundry: "Mark Simonson Studio" },
  { name: "Felt Tip Woman", foundry: "Mark Simonson Studio" },
  { name: "Goldenbook", foundry: "Mark Simonson Studio" },
  { name: "Grad", foundry: "Mark Simonson Studio" },
  { name: "Kandal", foundry: "Mark Simonson Studio" },
  { name: "Kinescope", foundry: "Mark Simonson Studio" },
  { name: "Lakeside", foundry: "Mark Simonson Studio" },
  { name: "Metallophile Sp8", foundry: "Mark Simonson Studio" },
  { name: "Mostra Nuova", foundry: "Mark Simonson Studio" },
  // Unpublished / in-progress catalog (image 3)
  { name: "Gazebo", foundry: "Mark Simonson Studio" },
  { name: "Aftermath", foundry: "Mark Simonson Studio" },
  { name: "American Script", foundry: "Mark Simonson Studio" },
  { name: "Antony", foundry: "Mark Simonson Studio" },
  { name: "Banner Script", foundry: "Mark Simonson Studio" },
  { name: "Bookmania Gothic", foundry: "Mark Simonson Studio" },
  { name: "California Script", foundry: "Mark Simonson Studio" },
  { name: "Champhor", foundry: "Mark Simonson Studio" },
];

function normalizeFamilyName(value: string): string {
  return value.trim().toLowerCase();
}

function stripVariantSuffix(normalized: string): string {
  return normalized
    .replace(/\s+\d{3}\s+(normal|italic|regular|bold)$/i, "")
    .replace(/\s+(normal|italic|regular|bold)$/i, "")
    .trim();
}

const PAID_FONT_LOOKUP = new Map(
  KNOWN_PAID_FONTS.map((entry) => [normalizeFamilyName(entry.name), entry])
);

function lookupPaidFontEntry(family: string): (typeof KNOWN_PAID_FONTS)[number] | null {
  const normalized = normalizeFamilyName(family);
  const direct = PAID_FONT_LOOKUP.get(normalized);
  if (direct) return direct;

  const stripped = stripVariantSuffix(normalized);
  const strippedMatch = PAID_FONT_LOOKUP.get(stripped);
  if (strippedMatch) return strippedMatch;

  for (const [key, entry] of PAID_FONT_LOOKUP.entries()) {
    if (normalized.startsWith(`${key} `) || stripped.startsWith(`${key} `)) {
      return entry;
    }
  }

  return null;
}

export function matchKnownPaidFontName(family: string): {
  matchedFamily: string;
  foundry: string;
  evidence: string;
} | null {
  const entry = lookupPaidFontEntry(family);
  if (!entry) return null;

  return {
    matchedFamily: entry.name,
    foundry: entry.foundry ?? "Commercial foundry",
    evidence: `Family name "${family}" matches known paid/commercial font "${entry.name}" (${entry.foundry ?? "commercial catalog"}).`,
  };
}

export function getKnownPaidFontNames(): string[] {
  return KNOWN_PAID_FONTS.map((entry) => entry.name);
}
