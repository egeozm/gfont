import { formatDiscoveryMessage, discoverGoogleFontsFromWebsite } from "./discoverFonts.js";
import { formatSuccessMessage, localizeGoogleFonts } from "./localize.js";
import type { LocalizeManyOptions, LocalizeManyResult, LocalizeOptions, LocalizeResult, LocalizeSharedOptions } from "./types.js";

function buildLocalizeOptions(
  fontCssUrl: string,
  options: LocalizeSharedOptions
): LocalizeOptions {
  return {
    url: fontCssUrl,
    baseDir: options.baseDir,
    cssPath: options.cssPath,
    formats: options.formats,
    subsets: options.subsets,
    prefix: options.prefix,
    fontDisplay: options.fontDisplay,
  };
}

export async function localizeFromWebsite(options: LocalizeManyOptions): Promise<LocalizeManyResult> {
  const discovery = await discoverGoogleFontsFromWebsite(options.websiteUrl, options.crawl);

  if (discovery.fontLinks.length === 0) {
    return {
      websiteUrl: options.websiteUrl,
      discovery,
      results: [],
    };
  }

  const results: LocalizeResult[] = [];

  for (const link of discovery.fontLinks) {
    results.push(await localizeGoogleFonts(buildLocalizeOptions(link.url, options)));
  }

  return {
    websiteUrl: options.websiteUrl,
    discovery,
    results,
  };
}

export async function localizeManyGoogleFonts(
  fontCssUrls: string[],
  options: LocalizeSharedOptions
): Promise<LocalizeResult[]> {
  const results: LocalizeResult[] = [];

  for (const url of fontCssUrls) {
    results.push(await localizeGoogleFonts(buildLocalizeOptions(url, options)));
  }

  return results;
}

export function formatLocalizeManyMessage(result: LocalizeManyResult): string {
  const lines = [formatDiscoveryMessage(result.discovery)];

  if (result.results.length === 0) {
    return lines.join("\n");
  }

  lines.push("");

  for (const singleResult of result.results) {
    lines.push(formatSuccessMessage(singleResult));
    lines.push("");
  }

  lines.push("Generated folders:");
  for (const singleResult of result.results) {
    lines.push(`- ${singleResult.outDir}`);
  }

  return lines.join("\n").trim();
}
