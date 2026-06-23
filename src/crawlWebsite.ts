import { fetchTextWithTimeout } from "./fetchUtils.js";
import type { CrawlMeta, CrawlOptions } from "./types.js";
import { resolveUrlAgainstBase } from "./urlUtils.js";

const ANCHOR_HREF_REGEX = /<a\b[^>]*\bhref\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))[^>]*>/gi;

const SKIP_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".zip",
  ".gz",
  ".mp4",
  ".mp3",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".css",
  ".js",
  ".json",
  ".xml",
]);

export const DEFAULT_CRAWL_OPTIONS = {
  crawl: true,
  maxPages: 50,
  maxDepth: 10,
  concurrency: 4,
} as const;

export function resolveCrawlOptions(options?: CrawlOptions): Required<CrawlOptions> {
  return {
    crawl: options?.crawl ?? DEFAULT_CRAWL_OPTIONS.crawl,
    maxPages: options?.maxPages ?? DEFAULT_CRAWL_OPTIONS.maxPages,
    maxDepth: options?.maxDepth ?? DEFAULT_CRAWL_OPTIONS.maxDepth,
    concurrency: options?.concurrency ?? DEFAULT_CRAWL_OPTIONS.concurrency,
  };
}

export function shouldCrawl(options?: CrawlOptions): boolean {
  const resolved = resolveCrawlOptions(options);
  return resolved.crawl && resolved.maxPages > 1;
}

export function extractAnchorHrefs(html: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = ANCHOR_HREF_REGEX.exec(html)) !== null) {
    const href = (match[2] ?? match[3])?.trim();
    if (href) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

export function normalizePageUrl(url: string, baseUrl?: string): string | null {
  try {
    const resolved = baseUrl ? resolveUrlAgainstBase(url, baseUrl) : url;
    if (!resolved) return null;

    const parsed = new URL(resolved);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSameOrigin(url: string, seedOrigin: string): boolean {
  try {
    return new URL(url).origin === seedOrigin;
  } catch {
    return false;
  }
}

export function isLikelyHtmlPage(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const lastSegment = pathname.split("/").pop() ?? "";

    if (!lastSegment || !lastSegment.includes(".")) {
      return true;
    }

    const dotIndex = lastSegment.lastIndexOf(".");
    const extension = lastSegment.slice(dotIndex);

    if (extension === ".html" || extension === ".htm" || extension === ".php" || extension === ".asp") {
      return true;
    }

    return !SKIP_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

export interface CrawledPage {
  url: string;
  html: string;
  depth: number;
}

export interface CrawlFailure {
  url: string;
  error: string;
}

export interface CrawlResult {
  seedUrl: string;
  seedOrigin: string;
  pages: CrawledPage[];
  failedPages: CrawlFailure[];
  crawlMeta: CrawlMeta;
}

async function fetchPageHtml(url: string): Promise<string> {
  return fetchTextWithTimeout(url, { accept: "text/html,application/xhtml+xml,*/*;q=0.8" });
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function crawlSameOriginPages(
  seedUrl: string,
  options?: CrawlOptions
): Promise<CrawlResult> {
  const resolved = resolveCrawlOptions(options);
  const normalizedSeed = normalizePageUrl(seedUrl.trim());
  if (!normalizedSeed) {
    throw new Error("Website URL must be a valid URL.");
  }

  const seedOrigin = new URL(normalizedSeed).origin;
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const failedPages: CrawlFailure[] = [];
  let limitReached: CrawlMeta["limitReached"];

  type QueueItem = { url: string; depth: number };
  const queue: QueueItem[] = [{ url: normalizedSeed, depth: 0 }];

  while (queue.length > 0 && pages.length < resolved.maxPages) {
    const batch: QueueItem[] = [];

    while (queue.length > 0 && batch.length < resolved.concurrency && pages.length + batch.length < resolved.maxPages) {
      const item = queue.shift();
      if (!item) break;
      if (visited.has(item.url)) continue;
      if (item.depth > resolved.maxDepth) {
        limitReached = limitReached ?? "maxDepth";
        continue;
      }
      visited.add(item.url);
      batch.push(item);
    }

    if (batch.length === 0) {
      break;
    }

    const fetchResults = await runWithConcurrency(
      batch.map((item) => async () => {
        try {
          const html = await fetchPageHtml(item.url);
          return { item, html, error: null as string | null };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { item, html: null as string | null, error: message };
        }
      }),
      resolved.concurrency
    );

    for (const result of fetchResults) {
      if (result.error || !result.html) {
        failedPages.push({ url: result.item.url, error: result.error ?? "Unknown fetch error" });
        if (result.item.url === normalizedSeed) {
          throw new Error(result.error ?? `Failed to fetch seed page ${normalizedSeed}.`);
        }
        continue;
      }

      pages.push({ url: result.item.url, html: result.html, depth: result.item.depth });

      if (pages.length >= resolved.maxPages) {
        limitReached = "maxPages";
        break;
      }

      for (const href of extractAnchorHrefs(result.html)) {
        const normalized = normalizePageUrl(href, result.item.url);
        if (!normalized || visited.has(normalized)) continue;
        if (!isSameOrigin(normalized, seedOrigin)) continue;
        if (!isLikelyHtmlPage(normalized)) continue;

        const nextDepth = result.item.depth + 1;
        if (nextDepth > resolved.maxDepth) {
          limitReached = limitReached ?? "maxDepth";
          continue;
        }

        queue.push({ url: normalized, depth: nextDepth });
      }
    }
  }

  if (queue.length > 0 && pages.length >= resolved.maxPages) {
    limitReached = "maxPages";
  }

  const crawlMeta: CrawlMeta = {
    enabled: true,
    seedUrl: normalizedSeed,
    pagesScanned: pages.length,
    pagesFailed: failedPages.length,
    maxPages: resolved.maxPages,
    maxDepth: resolved.maxDepth,
    limitReached,
    scannedPageUrls: pages.map((page) => page.url),
    failedPageUrls: failedPages.length > 0 ? failedPages : undefined,
  };

  return {
    seedUrl: normalizedSeed,
    seedOrigin,
    pages,
    failedPages,
    crawlMeta,
  };
}
