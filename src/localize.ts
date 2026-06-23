import path from "node:path";
import { downloadFontFiles } from "./download.js";
import { fetchCssForFormats } from "./fetchCss.js";
import { writeTestHtml } from "./generateTestHtml.js";
import { resolveCssPath, summarizeDownloads, writeLocalCssFile } from "./generateCss.js";
import { filterMergedVariantsByFormats, mergeFontVariants, enrichWithLegacyFallbacks } from "./merge.js";
import { resolveOutputDir } from "./outputDir.js";
import { parseFontFaceCssForFormats } from "./parseFontFace.js";
import { parseGoogleFontsUrl, shouldIncludeSubset } from "./parseUrl.js";
import type { FontFormat, LocalizeOptions, LocalizeResult } from "./types.js";

const DEFAULT_FORMATS: FontFormat[] = ["woff2", "woff", "ttf"];

function resolveSubsets(
  urlSubsets: string[] | null,
  cliSubsets: string[] | null
): string[] | null {
  if (cliSubsets && cliSubsets.length > 0) {
    return cliSubsets;
  }

  return urlSubsets;
}

export async function localizeGoogleFonts(options: LocalizeOptions): Promise<LocalizeResult> {
  const parsedUrl = parseGoogleFontsUrl(options.url);
  const formats = options.formats.length > 0 ? options.formats : DEFAULT_FORMATS;
  const allowedSubsets = resolveSubsets(parsedUrl.requestedSubsets, options.subsets);

  const cssByFormat = await fetchCssForFormats(parsedUrl.url, formats);
  const parsedVariants = parseFontFaceCssForFormats(cssByFormat);

  if (parsedVariants.length === 0) {
    throw new Error("No font variants found for the requested URL.");
  }

  const mergedVariants = enrichWithLegacyFallbacks(
    filterMergedVariantsByFormats(mergeFontVariants(parsedVariants), formats)
  ).filter((variant) => shouldIncludeSubset(variant.subset, allowedSubsets));

  if (mergedVariants.length === 0) {
    throw new Error("No downloadable font variants found for the requested formats.");
  }

  const { outDir, folderName } = await resolveOutputDir(options.baseDir, parsedUrl.families);
  const cssPath = resolveCssPath(outDir, options.cssPath ?? undefined);

  const { files: downloadedFiles, urlToFilename } = await downloadFontFiles(
    mergedVariants,
    outDir,
    formats
  );
  await writeLocalCssFile(
    cssPath,
    mergedVariants,
    formats,
    options.prefix,
    options.fontDisplay,
    urlToFilename
  );

  const testHtmlPath = await writeTestHtml(outDir, parsedUrl.families, mergedVariants);

  return {
    cssPath,
    outDir,
    folderName,
    testHtmlPath,
    families: parsedUrl.families,
    files: downloadedFiles,
    variantCount: mergedVariants.length,
  };
}

export function formatSuccessMessage(result: LocalizeResult): string {
  const uniqueFiles = new Set(result.files.map((file) => file.filename)).size;
  return [
    `Output folder: ${result.outDir}`,
    `Folder name: ${result.folderName}`,
    `Families: ${result.families.join(", ")}`,
    `Localized ${result.variantCount} font variant(s).`,
    `Downloaded ${uniqueFiles} file(s): ${summarizeDownloads(result.files)}.`,
    `CSS written to ${result.cssPath}`,
    `Test page written to ${result.testHtmlPath}`,
  ].join("\n");
}
