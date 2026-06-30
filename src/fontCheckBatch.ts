import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readSitesFileStats } from "./batch.js";
import { matchWatchlistFont, WATCHLIST_FONTS } from "./paidFontRegistry.js";
import { discoverFontReferencesFromWebsite } from "./scanFontReferences.js";
import type { CrawlOptions } from "./types.js";

export const FONT_CHECK_DEFAULT_MAX_PAGES = 150;
export const FONT_CHECK_DEFAULT_MAX_DEPTH = 150;

export interface FontCheckBatchOptions {
  sitesFile: string;
  outFile: string;
  crawl?: CrawlOptions;
}

export interface FontCheckSiteResult {
  url: string;
  usedFonts: Set<string>;
  status: string;
}

export interface FontCheckBatchResult {
  sitesFilePath: string;
  outFile: string;
  total: number;
  succeeded: number;
  failed: number;
  results: FontCheckSiteResult[];
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildCsvRow(values: string[]): string {
  return values.map(escapeCsvCell).join(",");
}

export async function runFontCheckBatch(
  options: FontCheckBatchOptions
): Promise<FontCheckBatchResult> {
  const sitesFilePath = path.resolve(options.sitesFile);
  const { sites, rawCount, duplicateCount } = await readSitesFileStats(options.sitesFile);
  const crawlOptions: CrawlOptions = {
    crawl: options.crawl?.crawl ?? true,
    maxPages: options.crawl?.maxPages ?? FONT_CHECK_DEFAULT_MAX_PAGES,
    maxDepth: options.crawl?.maxDepth ?? FONT_CHECK_DEFAULT_MAX_DEPTH,
    concurrency: options.crawl?.concurrency,
  };

  const outFile = path.resolve(options.outFile);
  const rows: string[] = [buildCsvRow(["url", ...WATCHLIST_FONTS, "status"])];
  const results: FontCheckSiteResult[] = [];

  console.log("");
  console.log(`Sites file: ${sitesFilePath}`);
  console.log(`Sites to check: ${sites.length}${duplicateCount > 0 ? ` (${duplicateCount} duplicate(s) skipped from ${rawCount} lines)` : ""}`);
  console.log(`Crawl: ${crawlOptions.crawl ? "on" : "off"}`);
  if (crawlOptions.crawl) {
    console.log(`Max pages per site: ${crawlOptions.maxPages}`);
    console.log(`Max crawl depth: ${crawlOptions.maxDepth}`);
  }
  console.log(`Output CSV: ${outFile}`);
  console.log("");

  for (let index = 0; index < sites.length; index += 1) {
    const url = sites[index];
    const progress = `[${index + 1}/${sites.length}]`;
    const usedFonts = new Set<string>();
    let status = "ok";

    console.log(`${progress} Checking ${url}...`);

    try {
      const discovery = await discoverFontReferencesFromWebsite(url, crawlOptions);

      for (const reference of discovery.references) {
        const matched = matchWatchlistFont(reference);
        if (matched) {
          usedFonts.add(matched);
        }
      }

      const crawlMeta = discovery.crawlMeta;
      if (crawlMeta?.enabled) {
        const limitNote = crawlMeta.limitReached ? `, stopped at ${crawlMeta.limitReached}` : "";
        console.log(`  Crawled ${crawlMeta.pagesScanned} page(s)${limitNote}`);
      }

      if (usedFonts.size > 0) {
        console.log(`  Used fonts: ${[...usedFonts].sort().join(", ")}`);
      }
    } catch (error) {
      status = error instanceof Error ? error.message : String(error);
      console.error(`${progress} Failed: ${status}`);
    }

    rows.push(
      buildCsvRow([
        url,
        ...WATCHLIST_FONTS.map((font) => (usedFonts.has(font) ? "used" : "clear")),
        status,
      ])
    );

    results.push({ url, usedFonts, status });
    console.log("");
  }

  await writeFile(outFile, `${rows.join("\n")}\n`, "utf8");

  const succeeded = results.filter((result) => result.status === "ok").length;
  const failed = results.length - succeeded;

  console.log("Font check complete.");
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`CSV saved to: ${outFile}`);

  return {
    sitesFilePath,
    outFile,
    total: results.length,
    succeeded,
    failed,
    results,
  };
}
