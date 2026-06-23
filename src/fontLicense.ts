import { matchCommercialHost } from "./commercialHosts.js";
import { matchFoundryFromMetadata } from "./foundryRegistry.js";
import {
  buildGoogleFontsSpecimenUrl,
  GOOGLE_FONTS_METADATA_URL,
  lookupGoogleFontsLicense,
} from "./googleFontsMetadata.js";
import { adviseFontLicense } from "./llmLicenseAdvisor.js";
import { matchKnownOpenFontName } from "./openFontRegistry.js";
import { matchKnownPaidFontName } from "./paidFontRegistry.js";
import { inspectEmbeddedFontLicense } from "./parseFontLicense.js";
import { isGoogleFontsCssApiUrl } from "./urlUtils.js";
import type {
  FontLicenseConfidence,
  FontLicenseInfo,
  FontLicenseStatus,
  LabelReference,
  LicenseResolutionOptions,
  SelectableFontVariant,
} from "./types.js";

const GOOGLE_FONTS_SOURCE = "Google Fonts";
const GOOGLE_FONTS_FALLBACK_LICENSE =
  "Open-source (Google Fonts — SIL OFL, Apache 2.0, or UFL)";

const sampleBufferCache = new Map<string, Buffer>();

export function getLicenseStatusLabel(status: FontLicenseStatus): string {
  switch (status) {
    case "free":
      return "Free / Open-source";
    case "unknown":
      return "Unknown license";
    case "restricted":
      return "Possibly paid / restricted";
  }
}

export function getCommercialUseLabel(status: FontLicenseStatus): string {
  switch (status) {
    case "free":
      return "Allowed";
    default:
      return "Not verified";
  }
}

function isGoogleFontsVariant(variant: SelectableFontVariant): boolean {
  return (
    isGoogleFontsCssApiUrl(variant.sourceCssUrl) ||
    Object.values(variant.sources).some((url) => url.includes("fonts.gstatic.com"))
  );
}

function buildGoogleFontsReferences(
  family: string,
  sourceCssUrl: string,
  specificLicense: string | null
): LabelReference[] {
  const references: LabelReference[] = [
    {
      forLabel: "status",
      title: "Discovered stylesheet",
      href: sourceCssUrl,
    },
    {
      forLabel: "status",
      title: "Google Fonts metadata",
      href: GOOGLE_FONTS_METADATA_URL,
      detail: specificLicense ? `license: ${specificLicense}` : "open-source catalog",
    },
    {
      forLabel: "status",
      title: "Google Fonts specimen",
      href: buildGoogleFontsSpecimenUrl(family),
    },
    {
      forLabel: "confidence",
      title: "Detection source",
      detail: "google_fonts — matched Google Fonts catalog",
    },
    {
      forLabel: "commercialUse",
      title: "License basis",
      href: GOOGLE_FONTS_METADATA_URL,
      detail: specificLicense ?? GOOGLE_FONTS_FALLBACK_LICENSE,
    },
  ];

  return references;
}

function buildLicenseInfo(input: {
  family: string;
  source: string;
  license: string;
  status: FontLicenseStatus;
  confidence: FontLicenseConfidence;
  detectionMethod: string;
  evidence: string[];
  references?: LabelReference[];
  notes?: string;
  aiAssisted?: boolean;
  llmConsulted?: boolean;
  statusLabel?: string;
}): FontLicenseInfo {
  return {
    family: input.family,
    source: input.source,
    license: input.license,
    commercialUse: getCommercialUseLabel(input.status),
    status: input.status,
    statusLabel: input.statusLabel ?? getLicenseStatusLabel(input.status),
    confidence: input.confidence,
    detectionMethod: input.detectionMethod,
    evidence: input.evidence,
    references: input.references,
    aiAssisted: input.aiAssisted ?? false,
    llmConsulted: input.llmConsulted ?? false,
    notes: input.notes,
  };
}

async function fetchSampleBuffer(sampleUrl: string): Promise<Buffer | undefined> {
  const cached = sampleBufferCache.get(sampleUrl);
  if (cached) return cached;

  try {
    const response = await fetch(sampleUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    sampleBufferCache.set(sampleUrl, buffer);
    return buffer;
  } catch {
    return undefined;
  }
}

async function resolveGoogleFontsFamilyLicense(
  family: string,
  sourceCssUrl: string
): Promise<FontLicenseInfo> {
  const specificLicense = await lookupGoogleFontsLicense(family);

  return buildLicenseInfo({
    family,
    source: GOOGLE_FONTS_SOURCE,
    license: specificLicense ?? GOOGLE_FONTS_FALLBACK_LICENSE,
    status: "free",
    confidence: "high",
    detectionMethod: "google_fonts",
    evidence: [
      `Discovered via Google Fonts stylesheet: ${sourceCssUrl}`,
      specificLicense
        ? `Google Fonts metadata reports license: ${specificLicense}`
        : "Google Fonts only distributes open-source licensed fonts.",
    ],
    references: buildGoogleFontsReferences(family, sourceCssUrl, specificLicense),
    notes: "Google Fonts fonts are distributed under open-source licenses.",
    llmConsulted: false,
  });
}

async function resolveSelfHostedFontLicense(
  family: string,
  sourceUrl: string,
  options: LicenseResolutionOptions = {}
): Promise<FontLicenseInfo> {
  const evidence: string[] = [`Self-hosted font source: ${sourceUrl}`];
  const references: LabelReference[] = [
    {
      forLabel: "status",
      title: "Font source URL",
      href: sourceUrl,
    },
  ];
  let foundryHints: string[] = [];

  const paidFontMatch = matchKnownPaidFontName(family);
  if (paidFontMatch) {
    evidence.push(paidFontMatch.evidence);
    references.push(
      {
        forLabel: "status",
        title: "Paid font registry",
        detail: paidFontMatch.evidence,
      },
      {
        forLabel: "confidence",
        title: "Detection source",
        detail: "paid_font_registry — name match",
      }
    );
    return buildLicenseInfo({
      family,
      source: sourceUrl,
      license: `Paid / commercial (${paidFontMatch.foundry})`,
      status: "restricted",
      statusLabel: "Paid / commercial",
      confidence: "high",
      detectionMethod: "paid_font_registry",
      evidence,
      references,
      llmConsulted: false,
      notes: "Listed in the known paid/commercial font registry. AI research was not needed.",
    });
  }

  const commercialHost = matchCommercialHost(sourceUrl, family);
  if (commercialHost) {
    evidence.push(commercialHost.evidence);
    foundryHints.push(commercialHost.provider);
    references.push(
      {
        forLabel: "status",
        title: "Commercial host match",
        href: sourceUrl,
        detail: commercialHost.evidence,
      },
      {
        forLabel: "confidence",
        title: "Detection source",
        detail: "commercial_host — URL/host pattern match",
      }
    );
    return buildLicenseInfo({
      family,
      source: sourceUrl,
      license: `${commercialHost.provider} (commercial provider)`,
      status: "restricted",
      confidence: "high",
      detectionMethod: "commercial_host",
      evidence,
      references,
      llmConsulted: false,
      notes: "Classified automatically from filename/host. AI research was not needed.",
    });
  }

  const sampleBuffer = await fetchSampleBuffer(sourceUrl);
  if (sampleBuffer) {
    const embedded = inspectEmbeddedFontLicense(sampleBuffer);
    if (embedded.metadata) {
      if (embedded.metadata.vendorId) {
        evidence.push(`Embedded OS/2 vendor ID: ${embedded.metadata.vendorId}`);
        references.push({
          forLabel: "status",
          title: "Embedded vendor ID",
          href: sourceUrl,
          detail: embedded.metadata.vendorId,
        });
      }
      if (embedded.metadata.copyright) {
        evidence.push(`Embedded copyright: ${embedded.metadata.copyright}`);
        references.push({
          forLabel: "status",
          title: "Embedded copyright",
          href: sourceUrl,
          detail: embedded.metadata.copyright,
        });
      }
      if (embedded.metadata.manufacturer) {
        evidence.push(`Embedded manufacturer: ${embedded.metadata.manufacturer}`);
        references.push({
          forLabel: "status",
          title: "Embedded manufacturer",
          href: sourceUrl,
          detail: embedded.metadata.manufacturer,
        });
      }

      const foundryMatch = matchFoundryFromMetadata({
        vendorId: embedded.metadata.vendorId,
        copyright: embedded.metadata.copyright,
        manufacturer: embedded.metadata.manufacturer,
        designer: embedded.metadata.designer,
      });

      if (foundryMatch) {
        evidence.push(foundryMatch.evidence);
        foundryHints.push(foundryMatch.foundry);
        references.push({
          forLabel: "status",
          title: "Foundry metadata",
          href: sourceUrl,
          detail: foundryMatch.evidence,
        });
        if (foundryMatch.status === "restricted") {
          references.push({
            forLabel: "confidence",
            title: "Detection source",
            detail: "foundry_metadata — commercial foundry match",
          });
          return buildLicenseInfo({
            family,
            source: sourceUrl,
            license: `${foundryMatch.foundry} (commercial foundry)`,
            status: "restricted",
            confidence: "high",
            detectionMethod: "foundry_metadata",
            evidence,
            references,
            llmConsulted: false,
            notes: "Classified automatically from foundry metadata. AI research was not needed.",
          });
        }
      }
    }

    if (embedded.status === "free") {
      references.push({
        forLabel: "confidence",
        title: "Detection source",
        detail: "embedded_metadata — open-source license marker in font file",
      });
      return buildLicenseInfo({
        family,
        source: sourceUrl,
        license: embedded.license,
        status: "free",
        confidence: "high",
        detectionMethod: "embedded_metadata",
        evidence: [...evidence, "Embedded font metadata contains an open-source license marker."],
        references,
        llmConsulted: false,
        notes: "License detected from embedded font metadata. AI research was not needed.",
      });
    }

    if (embedded.status === "restricted") {
      references.push({
        forLabel: "confidence",
        title: "Detection source",
        detail: "embedded_metadata — restricted license marker in font file",
      });
      return buildLicenseInfo({
        family,
        source: sourceUrl,
        license: embedded.license,
        status: "restricted",
        confidence: "high",
        detectionMethod: "embedded_metadata",
        evidence: [...evidence, "Embedded font metadata suggests a restricted license."],
        references,
        llmConsulted: false,
        notes: "Classified automatically from embedded font metadata. AI research was not needed.",
      });
    }
  } else {
    evidence.push("Could not download font binary for embedded metadata inspection.");
    references.push({
      forLabel: "status",
      title: "Font fetch",
      detail: "Could not download font binary for embedded metadata inspection.",
    });
  }

  const openFontMatch = await matchKnownOpenFontName(family);
  if (openFontMatch) {
    references.push(
      {
        forLabel: "status",
        title: "Open font registry",
        href: GOOGLE_FONTS_METADATA_URL,
        detail: openFontMatch.evidence,
      },
      {
        forLabel: "confidence",
        title: "Detection source",
        detail: "open_font_registry — name match (medium confidence)",
      }
    );
    return buildLicenseInfo({
      family,
      source: sourceUrl,
      license: "Likely open-source (name registry match)",
      status: "free",
      confidence: "medium",
      detectionMethod: "open_font_registry",
      evidence: [...evidence, openFontMatch.evidence],
      references,
      llmConsulted: false,
      notes: "Matched by family name against known open-source font registry. AI research was not needed.",
    });
  }

  if (options.enableLlmAdvisor) {
    const advisor = await adviseFontLicense(
      {
        family,
        sourceUrl,
        evidence,
        foundryHints,
      },
      options.llmAdvisor
    );

    if (advisor.decision === "restricted") {
      const llmReferences: LabelReference[] = [
        ...references,
        {
          forLabel: "status",
          title: "LLM advisor",
          href: advisor.apiHost,
          detail: advisor.rationale,
        },
        {
          forLabel: "confidence",
          title: "Detection source",
          detail: "llm_advisor — AI flagged as restricted (low confidence)",
        },
        ...advisor.links.map((link, index) => ({
          forLabel: "status",
          title: `LLM reference ${index + 1}`,
          href: link,
        })),
      ];
      return buildLicenseInfo({
        family,
        source: sourceUrl,
        license: "Likely restricted (AI-assisted research)",
        status: "restricted",
        confidence: "low",
        detectionMethod: "llm_advisor",
        evidence: [
          ...evidence,
          advisor.apiHost ? `LLM API host: ${advisor.apiHost}` : "",
          advisor.rationale,
          ...advisor.links.map((link) => `Reference: ${link}`),
        ].filter(Boolean),
        references: llmReferences,
        aiAssisted: true,
        llmConsulted: true,
        notes: "AI-assisted research flagged this font as potentially restricted. This is not legal advice.",
      });
    }

    if (advisor.aiAssisted) {
      if (advisor.apiHost) {
        evidence.push(`LLM API host: ${advisor.apiHost}`);
      }
      evidence.push(`LLM advisor: ${advisor.rationale}`);
      references.push({
        forLabel: "status",
        title: "LLM advisor",
        href: advisor.apiHost,
        detail: advisor.rationale,
      });
      return buildLicenseInfo({
        family,
        source: sourceUrl,
        license: "Unknown",
        status: "unknown",
        confidence: "low",
        detectionMethod: "fallback",
        evidence,
        references,
        aiAssisted: true,
        llmConsulted: true,
        notes: "AI research was consulted but could not confirm a safe license. Verify manually.",
      });
    }

    evidence.push(`LLM advisor: ${advisor.rationale}`);
  } else if (options.llmAdvisorRequested) {
    evidence.push("AI research was enabled but API URL or key is missing.");
    references.push({
      forLabel: "status",
      title: "AI research",
      detail: "Enabled but missing API URL or key.",
    });
  } else {
    evidence.push("AI research was not enabled for this analysis.");
  }

  references.push({
    forLabel: "status",
    title: "No authoritative source",
    detail: "Could not verify license automatically from registry, host, or embedded metadata.",
  });
  references.push({
    forLabel: "confidence",
    title: "Detection source",
    detail: "fallback — no confirming source found",
  });

  return buildLicenseInfo({
    family,
    source: sourceUrl,
    license: "Unknown",
    status: "unknown",
    confidence: "low",
    detectionMethod: "fallback",
    evidence,
    references,
    llmConsulted: false,
    notes: "Could not verify license automatically. Confirm you have the right to self-host this font.",
  });
}

export async function resolveFamilyLicenses(
  variants: SelectableFontVariant[],
  selfHostedFonts: Array<{ family: string; sourceUrl: string; sampleUrl?: string }> = [],
  options: LicenseResolutionOptions = {}
): Promise<FontLicenseInfo[]> {
  const licenses = new Map<string, FontLicenseInfo>();

  const families = [...new Set(variants.map((variant) => variant.family))];
  for (const family of families) {
    const familyVariants = variants.filter((variant) => variant.family === family);
    const sourceCssUrl = familyVariants[0]?.sourceCssUrl ?? "Unknown";

    if (familyVariants.every(isGoogleFontsVariant)) {
      licenses.set(family, await resolveGoogleFontsFamilyLicense(family, sourceCssUrl));
      continue;
    }

    const sampleUrl =
      familyVariants.flatMap((variant) => Object.values(variant.sources)).find(Boolean) ??
      sourceCssUrl;

    licenses.set(family, await resolveSelfHostedFontLicense(family, sampleUrl, options));
  }

  for (const asset of selfHostedFonts) {
    if (licenses.has(asset.family)) continue;

    licenses.set(
      asset.family,
      await resolveSelfHostedFontLicense(
        asset.family,
        asset.sampleUrl ?? asset.sourceUrl,
        options
      )
    );
  }

  return Array.from(licenses.values()).sort((a, b) => a.family.localeCompare(b.family));
}

export function getSelectedFamilyLicenses(
  licenses: FontLicenseInfo[],
  selectedVariantIds: string[],
  variants: SelectableFontVariant[]
): FontLicenseInfo[] {
  const selectedFamilies = new Set(
    variants
      .filter((variant) => selectedVariantIds.includes(variant.id))
      .map((variant) => variant.family)
  );

  return licenses.filter((license) => selectedFamilies.has(license.family));
}

export function hasUnverifiedLicenses(licenses: FontLicenseInfo[]): boolean {
  return licenses.some((license) => license.status === "unknown" || license.status === "restricted");
}

export function formatLicenseReferences(license: FontLicenseInfo): string[] {
  if (!license.references?.length) {
    return [];
  }

  return license.references.map((ref) => {
    const detail = ref.detail ? ` — ${ref.detail}` : "";
    if (ref.href) {
      return `  - ${ref.title}: ${ref.href}${detail}`;
    }
    return `  - ${ref.title}${detail}`;
  });
}

export function generateLicenseSummaryText(licenses: FontLicenseInfo[]): string {
  const lines = [
    "Google Fonts Localizer — License Summary",
    "Generated by gfont-localize",
    "",
    "Review this file before using downloaded fonts in production.",
    "This summary is informational only and is not legal advice.",
    "",
  ];

  for (const license of licenses) {
    lines.push(
      `Font: ${license.family}`,
      `Source: ${license.source}`,
      `License: ${license.license}`,
      `Commercial use: ${license.commercialUse}`,
      `Status: ${license.statusLabel}`,
      `Confidence: ${license.confidence}`,
    );

    if (license.detectionMethod) {
      lines.push(`Detection method: ${license.detectionMethod}`);
    }

    lines.push(`AI research consulted: ${license.llmConsulted ? "Yes" : "No"}`);

    const referenceLines = formatLicenseReferences(license);
    if (referenceLines.length > 0) {
      lines.push("References:");
      lines.push(...referenceLines);
    }

    if (license.evidence?.length) {
      lines.push("Evidence:");
      for (const item of license.evidence) {
        lines.push(`  - ${item}`);
      }
    }

    if (license.aiAssisted) {
      lines.push("AI-assisted: Yes (not legal advice)");
    }

    if (license.notes) {
      lines.push(`Notes: ${license.notes}`);
    }

    lines.push("");
  }

  if (hasUnverifiedLicenses(licenses)) {
    lines.push(
      "WARNING",
      "Some fonts could not be verified as free/open-source.",
      "Using paid, proprietary, or restricted fonts without a valid license may create legal or financial risk.",
      "Please confirm that you have the right to use these fonts before downloading or self-hosting them."
    );
  }

  return lines.join("\n");
}

export const LICENSE_WARNING_MESSAGE =
  "Some detected fonts could not be verified as free/open-source.\n\nUsing paid, proprietary, or restricted fonts without a valid license may create legal or financial risk. Please confirm that you have the right to use these fonts before downloading or self-hosting them.";
