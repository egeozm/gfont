import JSZip from "jszip";
import { buildVariantId } from "./analyzeFonts.js";
import { downloadFontFilesToMemory } from "./download.js";
import {
  generateLicenseSummaryText,
  getSelectedFamilyLicenses,
  hasUnverifiedLicenses,
  LICENSE_WARNING_MESSAGE,
} from "./fontLicense.js";
import { generateInstallInstructions } from "./generateInstallInstructions.js";
import { generateLocalCss } from "./generateCss.js";
import { generateTestHtml } from "./generateTestHtml.js";
import {
  buildWebsiteReportPdfFilename,
  generateWebsiteReportPdf,
} from "./generateWebsiteReportPdf.js";
import { generateWebsiteReport } from "./generateWebsiteReport.js";
import { slugify } from "./filename.js";
import type {
  ExportSelectionRequest,
  ExportSelectionResult,
  MergedFontVariant,
  SelectableFontVariant,
} from "./types.js";

function toMergedVariant(variant: SelectableFontVariant): MergedFontVariant {
  return {
    family: variant.family,
    style: variant.style,
    weight: variant.weight,
    subset: variant.subset,
    fontDisplay: variant.fontDisplay,
    unicodeRange: variant.unicodeRange,
    sources: { ...variant.sources },
  };
}

function resolveSelectedVariants(
  variants: SelectableFontVariant[],
  selectedVariantIds: string[]
): SelectableFontVariant[] {
  const selected = new Set(selectedVariantIds);
  return variants.filter((variant) => selected.has(variant.id));
}

function buildZipName(variants: SelectableFontVariant[], requestedName?: string): string {
  if (requestedName) {
    return requestedName.endsWith(".zip") ? requestedName : `${requestedName}.zip`;
  }

  const families = [...new Set(variants.map((variant) => slugify(variant.family)))].filter(Boolean);
  const base = families.length > 0 ? families.join("-") : "fonts";
  return `${base}-localized.zip`;
}

export async function exportSelectionToZip(
  request: ExportSelectionRequest
): Promise<ExportSelectionResult> {
  const selectedVariants = resolveSelectedVariants(request.variants, request.selectedVariantIds);

  if (selectedVariants.length === 0) {
    throw new Error("Select at least one font variant to export.");
  }

  const selectedLicenses = getSelectedFamilyLicenses(
    request.familyLicenses ?? [],
    request.selectedVariantIds,
    request.variants
  );

  if (hasUnverifiedLicenses(selectedLicenses) && !request.acknowledgeLicenseRisk) {
    throw new Error(LICENSE_WARNING_MESSAGE);
  }

  const formats = request.formats.length > 0 ? request.formats : (["woff2", "woff", "ttf"] as const);
  const mergedVariants = selectedVariants.map(toMergedVariant);
  const { files, urlToFilename } = await downloadFontFilesToMemory(mergedVariants, [...formats]);
  const cssPrefix = request.prefix ?? "./fonts/";
  const css = generateLocalCss(
    mergedVariants,
    [...formats],
    cssPrefix,
    request.fontDisplay,
    urlToFilename
  );

  const families = [...new Set(selectedVariants.map((variant) => variant.family))];
  const testHtml = generateTestHtml(families, mergedVariants);
  const installContext = request.installContext;
  const installMd = generateInstallInstructions({
    inputUrl: installContext?.inputUrl ?? "Unknown",
    inputType: installContext?.inputType ?? "googleFontsCss",
    discoveredFontCssUrls: installContext?.discoveredFontCssUrls ?? [],
    families,
    prefix: cssPrefix,
    formats: [...formats],
  });

  const zip = new JSZip();
  zip.file("fonts.css", css);
  zip.file("test.html", testHtml);
  zip.file("INSTALL.md", installMd);
  zip.file("LICENSE-SUMMARY.txt", generateLicenseSummaryText(selectedLicenses));

  if (request.reportContext) {
    zip.file("WEBSITE-REPORT.pdf", await generateWebsiteReportPdf(request.reportContext));
    zip.file("WEBSITE-REPORT.txt", generateWebsiteReport(request.reportContext));
  }

  const fontsFolder = zip.folder("fonts");
  if (!fontsFolder) {
    throw new Error("Failed to create fonts folder in ZIP.");
  }

  for (const [filename, buffer] of files.entries()) {
    fontsFolder.file(filename, buffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  return {
    zipName: buildZipName(selectedVariants, request.zipName),
    fileCount: files.size,
    variantCount: selectedVariants.length,
    buffer,
  };
}

export function estimateExportFileCount(
  variants: SelectableFontVariant[],
  selectedVariantIds: string[],
  formats: string[]
): number {
  const selected = resolveSelectedVariants(variants, selectedVariantIds);
  const uniqueFilenames = new Set<string>();

  for (const variant of selected) {
    for (const format of formats) {
      if (variant.sources[format as keyof typeof variant.sources]) {
        uniqueFilenames.add(buildVariantId(variant) + format);
      }
    }
  }

  return uniqueFilenames.size;
}
