import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { analyzeInput, getDefaultSelectedVariantIds } from "./analyzeFonts.js";
import {
  buildWebsiteReportPdfFilename,
  generateWebsiteReportPdf,
} from "./generateWebsiteReportPdf.js";
import { getHardcodedLlmAdvisor } from "./llmLicenseAdvisor.js";
import type { AnalyzeResult, FontFormat, WebsiteReportInput } from "./types.js";

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_PAGES = 50;

export interface BatchOptions {
  outDir: string;
  formats: FontFormat[];
  maxPages?: number;
}

export interface BatchPromptResult {
  sitesFilePath: string;
  maxDepth: number;
}

export interface BatchSiteResult {
  url: string;
  success: boolean;
  reportPath?: string;
  error?: string;
}

export interface BatchRunResult {
  sitesFilePath: string;
  reportsDir: string;
  maxDepth: number;
  maxPages: number;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchSiteResult[];
}

async function promptForPositiveInt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  fallback: number
): Promise<number> {
  while (true) {
    const answer = await rl.question(`${question} [${fallback}]: `);
    const trimmed = answer.trim();

    if (!trimmed) {
      return fallback;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    console.log("Please enter a positive integer.");
  }
}

export async function promptForInputs(): Promise<BatchPromptResult> {
  const rl = createInterface({ input, output });

  try {
    let sitesFilePath = "";

    while (!sitesFilePath) {
      const answer = await rl.question("Path to sites file (one URL per line): ");
      sitesFilePath = answer.trim();

      if (!sitesFilePath) {
        console.log("A file path is required.");
      }
    }

    const maxDepth = await promptForPositiveInt(
      rl,
      "Maximum crawl search depth",
      DEFAULT_MAX_DEPTH
    );

    return {
      sitesFilePath,
      maxDepth,
    };
  } finally {
    rl.close();
  }
}

function parseSitesFromContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function normalizeSiteUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function dedupeSites(sites: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const site of sites) {
    const key = normalizeSiteUrlKey(site);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(site);
  }

  return unique;
}

export async function readSitesFromFile(filePath: string): Promise<string[]> {
  const { sites } = await readSitesFileStats(filePath);
  return sites;
}

export async function readSitesFileStats(filePath: string): Promise<{
  sites: string[];
  rawCount: number;
  duplicateCount: number;
}> {
  const resolvedPath = path.resolve(filePath);
  const content = await readFile(resolvedPath, "utf8");
  const rawSites = parseSitesFromContent(content);
  const sites = dedupeSites(rawSites);

  if (sites.length === 0) {
    throw new Error(`No sites found in "${resolvedPath}". Add one URL per line.`);
  }

  return {
    sites,
    rawCount: rawSites.length,
    duplicateCount: rawSites.length - sites.length,
  };
}

export function analyzeResultToReportInput(
  result: AnalyzeResult,
  formats: FontFormat[]
): WebsiteReportInput {
  const selectedVariantIds = getDefaultSelectedVariantIds(
    result.variants,
    result.recommendedSubsets
  );

  return {
    inputUrl: result.inputUrl,
    inputType: result.inputType,
    discoveredFontCssUrls: result.discoveredFontCssUrls,
    ignoredDirectFontAssetCount: result.ignoredDirectFontAssetCount,
    scannedStylesheets: result.scannedStylesheets,
    pageLang: result.pageLang,
    recommendedSubsets: result.recommendedSubsets,
    crawlMeta: result.crawlMeta,
    variants: result.variants,
    selectedVariantIds,
    familyLicenses: result.familyLicenses,
    llmResearch: result.llmResearch,
    formats,
  };
}

export async function runBatch(options: BatchOptions): Promise<BatchRunResult> {
  const prompts = await promptForInputs();
  const sites = await readSitesFromFile(prompts.sitesFilePath);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const reportsDir = path.resolve(options.outDir, "reports");

  await mkdir(reportsDir, { recursive: true });

  console.log("");
  console.log(`Sites file: ${path.resolve(prompts.sitesFilePath)}`);
  console.log(`Sites to process: ${sites.length}`);
  console.log(`Max crawl depth: ${prompts.maxDepth}`);
  console.log(`Max pages per site: ${maxPages}`);
  console.log(`Reports directory: ${reportsDir}`);
  console.log("");

  const results: BatchSiteResult[] = [];

  for (let index = 0; index < sites.length; index += 1) {
    const url = sites[index];
    const progress = `[${index + 1}/${sites.length}]`;

    console.log(`${progress} Analyzing ${url}...`);

    try {
      const llmAdvisor = getHardcodedLlmAdvisor();
      const analysis = await analyzeInput({
        url,
        formats: options.formats,
        subsets: null,
        enableLlmAdvisor: llmAdvisor?.enabled ?? undefined,
        llmAdvisor,
        crawl: {
          crawl: true,
          maxPages,
          maxDepth: prompts.maxDepth,
        },
      });

      const reportInput = analyzeResultToReportInput(analysis, options.formats);
      const pdfBuffer = await generateWebsiteReportPdf(reportInput);
      const filename = buildWebsiteReportPdfFilename(analysis.inputUrl);
      const reportPath = path.join(reportsDir, filename);

      await writeFile(reportPath, pdfBuffer);

      results.push({
        url,
        success: true,
        reportPath,
      });

      console.log(`${progress} Saved report: ${reportPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      results.push({
        url,
        success: false,
        error: message,
      });

      console.error(`${progress} Failed: ${message}`);
    }

    console.log("");
  }

  const succeeded = results.filter((result) => result.success).length;
  const failed = results.length - succeeded;

  console.log("Batch complete.");
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Reports saved to: ${reportsDir}`);

  return {
    sitesFilePath: path.resolve(prompts.sitesFilePath),
    reportsDir,
    maxDepth: prompts.maxDepth,
    maxPages,
    total: results.length,
    succeeded,
    failed,
    results,
  };
}
