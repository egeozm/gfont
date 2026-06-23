import { fetchCssForFormats } from "./fetchCss.js";
import { discoverGoogleFontsFromWebsite } from "./discoverFonts.js";
import {
  hasUnverifiedLicenses,
  resolveFamilyLicenses,
} from "./fontLicense.js";
import {
  buildLlmResearchMeta,
  isLlmAdvisorEnabled,
  isLlmAdvisorEnabledFromEnv,
} from "./llmLicenseAdvisor.js";
import {
  enrichWithLegacyFallbacks,
  filterMergedVariantsByFormats,
  mergeFontVariants,
} from "./merge.js";
import { parseFontFaceCssForFormats } from "./parseFontFace.js";
import { parseGoogleFontsUrl, shouldIncludeSubset } from "./parseUrl.js";
import { isGoogleFontsCssApiUrl } from "./urlUtils.js";
import type {
  AnalyzeInputOptions,
  AnalyzeResult,
  FontFormat,
  MergedFontVariant,
  SelectableFontVariant,
} from "./types.js";

const DEFAULT_FORMATS: FontFormat[] = ["woff2", "woff", "ttf"];

function resolveLicenseOptions(options: AnalyzeInputOptions) {
  const llmAdvisor = options.llmAdvisor;
  const enabled =
    llmAdvisor?.enabled === true ||
    (llmAdvisor?.enabled !== false && options.enableLlmAdvisor === true) ||
    (llmAdvisor?.enabled !== false &&
      options.enableLlmAdvisor !== false &&
      isLlmAdvisorEnabledFromEnv());

  return {
    enableLlmAdvisor: enabled && isLlmAdvisorEnabled(llmAdvisor),
    llmAdvisorRequested: enabled,
    llmAdvisor,
  };
}

export function buildVariantId(
  variant: Pick<MergedFontVariant, "family" | "subset" | "weight" | "style">
): string {
  return `${variant.family}|${variant.subset}|${variant.weight}|${variant.style}`;
}

function resolveSubsets(
  urlSubsets: string[] | null,
  cliSubsets: string[] | null
): string[] | null {
  if (cliSubsets && cliSubsets.length > 0) {
    return cliSubsets;
  }

  return urlSubsets;
}

function toSelectableVariant(
  variant: MergedFontVariant,
  sourceCssUrl: string
): SelectableFontVariant {
  return {
    id: buildVariantId(variant),
    family: variant.family,
    style: variant.style,
    weight: variant.weight,
    subset: variant.subset,
    fontDisplay: variant.fontDisplay,
    unicodeRange: variant.unicodeRange,
    sources: { ...variant.sources },
    sourceCssUrl,
  };
}

function dedupeSelectableVariants(variants: SelectableFontVariant[]): SelectableFontVariant[] {
  const merged = new Map<string, SelectableFontVariant>();

  for (const variant of variants) {
    const existing = merged.get(variant.id);
    if (!existing) {
      merged.set(variant.id, variant);
      continue;
    }

    merged.set(variant.id, {
      ...existing,
      sources: {
        ...existing.sources,
        ...variant.sources,
      },
      fontDisplay: existing.fontDisplay ?? variant.fontDisplay,
      unicodeRange: existing.unicodeRange ?? variant.unicodeRange,
    });
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

export async function analyzeGoogleFontsCssUrl(
  fontCssUrl: string,
  options: Pick<AnalyzeInputOptions, "formats" | "subsets">
): Promise<SelectableFontVariant[]> {
  const parsedUrl = parseGoogleFontsUrl(fontCssUrl);
  const formats = options.formats.length > 0 ? options.formats : DEFAULT_FORMATS;
  const allowedSubsets = resolveSubsets(parsedUrl.requestedSubsets, options.subsets ?? null);

  const cssByFormat = await fetchCssForFormats(parsedUrl.url, formats);
  const parsedVariants = parseFontFaceCssForFormats(cssByFormat);

  if (parsedVariants.length === 0) {
    return [];
  }

  const mergedVariants = enrichWithLegacyFallbacks(
    filterMergedVariantsByFormats(mergeFontVariants(parsedVariants), formats)
  ).filter((variant) => shouldIncludeSubset(variant.subset, allowedSubsets));

  return mergedVariants.map((variant) => toSelectableVariant(variant, parsedUrl.url));
}

function withLlmCallCount(
  llmResearch: ReturnType<typeof buildLlmResearchMeta>,
  familyLicenses: Awaited<ReturnType<typeof resolveFamilyLicenses>>
) {
  const llmCallCount = familyLicenses.filter((license) => license.llmConsulted).length;
  return llmCallCount > 0 ? { ...llmResearch, llmCallCount } : llmResearch;
}

export async function analyzeInput(options: AnalyzeInputOptions): Promise<AnalyzeResult> {
  const formats = options.formats.length > 0 ? options.formats : DEFAULT_FORMATS;
  const inputUrl = options.url.trim();
  const licenseOptions = resolveLicenseOptions(options);
  const llmResearch = buildLlmResearchMeta({
    enableLlmAdvisor: licenseOptions.enableLlmAdvisor,
    llmAdvisor: licenseOptions.llmAdvisorRequested
      ? { ...licenseOptions.llmAdvisor, enabled: true }
      : licenseOptions.llmAdvisor,
  });

  if (isGoogleFontsCssApiUrl(inputUrl)) {
    const variants = dedupeSelectableVariants(await analyzeGoogleFontsCssUrl(inputUrl, options));
    const familyLicenses = await resolveFamilyLicenses(variants, [], licenseOptions);

    return {
      inputUrl,
      inputType: "googleFontsCss",
      discoveredFontCssUrls: [inputUrl],
      ignoredDirectFontAssetCount: 0,
      variants,
      families: [...new Set(variants.map((variant) => variant.family))],
      familyLicenses,
      hasUnverifiedLicenses: hasUnverifiedLicenses(familyLicenses),
      llmResearch: withLlmCallCount(llmResearch, familyLicenses),
    };
  }

  const discovery = await discoverGoogleFontsFromWebsite(inputUrl, options.crawl);
  const allVariants: SelectableFontVariant[] = [];

  for (const link of discovery.fontLinks) {
    const variants = await analyzeGoogleFontsCssUrl(link.url, options);
    allVariants.push(...variants);
  }

  const deduped = dedupeSelectableVariants(allVariants);
  const familyLicenses = await resolveFamilyLicenses(
    deduped,
    (discovery.selfHostedFonts ?? []).map((asset) => ({
      family: asset.family,
      sourceUrl: asset.sourceUrl,
      sampleUrl: asset.sampleUrl,
    })),
    licenseOptions
  );

  return {
    inputUrl: discovery.pageUrl,
    inputType: "website",
    discoveredFontCssUrls: discovery.fontLinks.map((link) => link.url),
    discoveredFontLinks: discovery.fontLinks,
    ignoredDirectFontAssetCount: discovery.ignoredDirectFontAssetCount,
    scannedStylesheets: discovery.scannedStylesheets,
    pageLang: discovery.pageLang,
    recommendedSubsets: discovery.recommendedSubsets,
    crawlMeta: discovery.crawlMeta,
    variants: deduped,
    families: [...new Set(deduped.map((variant) => variant.family))],
    familyLicenses,
    hasUnverifiedLicenses: hasUnverifiedLicenses(familyLicenses),
    llmResearch: withLlmCallCount(llmResearch, familyLicenses),
  };
}

export function getDefaultSelectedVariantIds(
  variants: SelectableFontVariant[],
  recommendedSubsets?: string[] | null
): string[] {
  const subsets =
    recommendedSubsets && recommendedSubsets.length > 0 ? recommendedSubsets : ["latin"];

  const recommended = variants.filter((variant) => subsets.includes(variant.subset));
  if (recommended.length > 0) {
    return recommended.map((variant) => variant.id);
  }

  const latinVariants = variants.filter((variant) => variant.subset === "latin");
  if (latinVariants.length > 0) {
    return latinVariants.map((variant) => variant.id);
  }

  return variants.map((variant) => variant.id);
}
