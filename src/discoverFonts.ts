import { crawlSameOriginPages, shouldCrawl } from "./crawlWebsite.js";
import { fetchTextWithTimeout } from "./fetchUtils.js";
import {
  extractPageLangFromHtml,
  getRecommendedSubsetsForLang,
} from "./localeSubsets.js";
import type {
  CrawlMeta,
  CrawlOptions,
  DiscoveredFontLink,
  SelfHostedFontAsset,
  WebsiteDiscoveryResult,
} from "./types.js";
import {
  dedupeGoogleFontsCssUrls,
  isDirectFontBinaryUrl,
  isGoogleFontsCssApiUrl,
  isGoogleFontsStaticUrl,
  normalizeGoogleFontsCssUrl,
  resolveUrlAgainstBase,
  stripCssUrl,
} from "./urlUtils.js";

const LINK_HREF_REGEX = /<link\b[^>]*\bhref\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))[^>]*>/gi;
const STYLE_BLOCK_REGEX = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CSS_IMPORT_REGEX = /@import\s+(?:url\(\s*(['"]?)([^)'"]+)\1\s*\)|(['"])([^'"]+)\3)/gi;
const CSS_URL_REGEX = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;

export class WebsiteFetchError extends Error {
  constructor(
    message: string,
    public readonly pageUrl: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "WebsiteFetchError";
  }
}

export interface SinglePageDiscoveryResult {
  pageUrl: string;
  pageLang: string | null;
  fontCssUrls: string[];
  scannedStylesheets: string[];
  ignoredDirectFontAssetCount: number;
  selfHostedFonts: SelfHostedFontAsset[];
}

function extractAllLinkHrefs(html: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = LINK_HREF_REGEX.exec(html)) !== null) {
    const href = (match[2] ?? match[3])?.trim();
    if (href) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

function extractLinkHrefs(html: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = LINK_HREF_REGEX.exec(html)) !== null) {
    const tag = match[0].toLowerCase();
    const href = (match[2] ?? match[3])?.trim();
    if (!href) continue;

    const isStylesheet =
      tag.includes('rel="stylesheet"') ||
      tag.includes("rel='stylesheet'") ||
      tag.includes('rel=stylesheet') ||
      href.includes("fonts.googleapis.com");

    if (isStylesheet) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

function extractInlineStyleBlocks(html: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = STYLE_BLOCK_REGEX.exec(html)) !== null) {
    const content = match[1]?.trim();
    if (content) {
      blocks.push(content);
    }
  }

  return blocks;
}

function extractCssImportUrls(css: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = CSS_IMPORT_REGEX.exec(css)) !== null) {
    const url = match[2] ?? match[4];
    if (url) {
      urls.push(stripCssUrl(url));
    }
  }

  return urls;
}

function extractCssUrlReferences(css: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = CSS_URL_REGEX.exec(css)) !== null) {
    const url = match[2];
    if (url) {
      urls.push(stripCssUrl(url));
    }
  }

  return urls;
}

const ICON_FONT_URL_PATTERNS = [
  /font-awesome/i,
  /fontawesome/i,
  /fa-brands/i,
  /fa-solid/i,
  /fa-regular/i,
  /bootstrap-icons/i,
  /material-icons/i,
  /ionicons/i,
  /remixicon/i,
];

function isIconFontUrl(url: string): boolean {
  return ICON_FONT_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function inferFamilyFromFontUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop() ?? "unknown";
    const base = filename.replace(/\.(woff2|woff|ttf|otf|eot)(\?.*)?$/i, "");
    if (!base) return "Unknown Font";

    return base
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Unknown Font";
  }
}

function collectSelfHostedFontAssets(rawUrls: string[], baseUrl: string): SelfHostedFontAsset[] {
  const assets: SelfHostedFontAsset[] = [];

  for (const rawUrl of rawUrls) {
    const resolved = resolveUrlAgainstBase(rawUrl, baseUrl);
    if (!resolved || !isDirectFontBinaryUrl(resolved)) continue;
    if (isGoogleFontsCssApiUrl(resolved) || isGoogleFontsStaticUrl(resolved)) continue;
    if (isIconFontUrl(resolved)) continue;

    assets.push({
      family: inferFamilyFromFontUrl(resolved),
      sourceUrl: resolved,
      sampleUrl: resolved,
    });
  }

  return assets;
}

function dedupeSelfHostedFonts(assets: SelfHostedFontAsset[]): SelfHostedFontAsset[] {
  const seen = new Set<string>();
  const result: SelfHostedFontAsset[] = [];

  for (const asset of assets) {
    if (seen.has(asset.sourceUrl)) continue;
    seen.add(asset.sourceUrl);
    result.push(asset);
  }

  return result;
}

function collectGoogleFontsCssCandidates(rawUrls: string[], baseUrl: string): string[] {
  const candidates: string[] = [];

  for (const rawUrl of rawUrls) {
    const resolved = resolveUrlAgainstBase(rawUrl, baseUrl);
    if (!resolved) continue;

    if (isGoogleFontsCssApiUrl(resolved)) {
      candidates.push(resolved);
      continue;
    }

    if (isDirectFontBinaryUrl(resolved)) {
      continue;
    }
  }

  return candidates;
}

async function fetchText(url: string): Promise<string> {
  return fetchTextWithTimeout(url);
}

function buildDiscoveredFontLinks(
  urlToPages: Map<string, Set<string>>
): DiscoveredFontLink[] {
  return [...urlToPages.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, pages]) => {
      const sourcePageUrls = [...pages].sort();
      return {
        url,
        sourcePageUrl: sourcePageUrls[0] ?? url,
        sourcePageUrls,
      };
    });
}

export function scanHtmlForGoogleFonts(html: string, pageUrl: string): {
  fontCssUrls: string[];
  stylesheetUrls: string[];
  ignoredDirectFontAssetCount: number;
  selfHostedFonts: SelfHostedFontAsset[];
} {
  const candidates: string[] = [];
  const stylesheetUrls: string[] = [];
  const selfHostedFonts: SelfHostedFontAsset[] = [];

  for (const href of extractLinkHrefs(html)) {
    const resolved = resolveUrlAgainstBase(href, pageUrl);
    if (!resolved) continue;

    if (isGoogleFontsCssApiUrl(resolved)) {
      candidates.push(resolved);
      continue;
    }

    if (resolved.endsWith(".css") || resolved.includes(".css?")) {
      stylesheetUrls.push(resolved);
    }
  }

  for (const styleBlock of extractInlineStyleBlocks(html)) {
    candidates.push(...collectGoogleFontsCssCandidates(extractCssImportUrls(styleBlock), pageUrl));
    candidates.push(...collectGoogleFontsCssCandidates(extractCssUrlReferences(styleBlock), pageUrl));
    selfHostedFonts.push(...collectSelfHostedFontAssets(extractCssUrlReferences(styleBlock), pageUrl));
  }

  const ignoredDirectFontUrls = new Set<string>();
  for (const raw of [
    ...extractAllLinkHrefs(html),
    ...extractInlineStyleBlocks(html).flatMap((block) => extractCssUrlReferences(block)),
  ]) {
    const resolved = resolveUrlAgainstBase(raw, pageUrl);
    if (!resolved) continue;
    if (!isDirectFontBinaryUrl(resolved) || isGoogleFontsCssApiUrl(resolved)) continue;

    if (isGoogleFontsStaticUrl(resolved)) {
      ignoredDirectFontUrls.add(resolved);
      continue;
    }

    if (isIconFontUrl(resolved)) {
      continue;
    }

    selfHostedFonts.push({
      family: inferFamilyFromFontUrl(resolved),
      sourceUrl: resolved,
      sampleUrl: resolved,
    });
  }

  return {
    fontCssUrls: dedupeGoogleFontsCssUrls(candidates),
    stylesheetUrls,
    ignoredDirectFontAssetCount: ignoredDirectFontUrls.size,
    selfHostedFonts: dedupeSelfHostedFonts(selfHostedFonts),
  };
}

export function scanCssForGoogleFonts(css: string, cssUrl: string): string[] {
  const candidates = [
    ...collectGoogleFontsCssCandidates(extractCssImportUrls(css), cssUrl),
    ...collectGoogleFontsCssCandidates(extractCssUrlReferences(css), cssUrl),
  ];

  return dedupeGoogleFontsCssUrls(candidates);
}

export function scanCssForSelfHostedFonts(css: string, cssUrl: string): SelfHostedFontAsset[] {
  return dedupeSelfHostedFonts([
    ...collectSelfHostedFontAssets(extractCssImportUrls(css), cssUrl),
    ...collectSelfHostedFontAssets(extractCssUrlReferences(css), cssUrl),
  ]);
}

export async function discoverFontsFromSinglePage(
  pageUrl: string,
  html?: string
): Promise<SinglePageDiscoveryResult> {
  let parsedPageUrl: URL;

  try {
    parsedPageUrl = new URL(pageUrl.trim());
  } catch {
    throw new Error("Website URL must be a valid URL.");
  }

  if (!["http:", "https:"].includes(parsedPageUrl.protocol)) {
    throw new Error("Website URL must use http or https.");
  }

  const pageHtml = html ?? (await fetchText(parsedPageUrl.toString()));
  const pageLang = extractPageLangFromHtml(pageHtml);
  const initialScan = scanHtmlForGoogleFonts(pageHtml, parsedPageUrl.toString());
  const candidates = [...initialScan.fontCssUrls];
  const fetchedStylesheets: string[] = [];
  const selfHostedFonts = [...initialScan.selfHostedFonts];

  for (const stylesheetUrl of initialScan.stylesheetUrls) {
    try {
      const css = await fetchText(stylesheetUrl);
      fetchedStylesheets.push(stylesheetUrl);
      candidates.push(...scanCssForGoogleFonts(css, stylesheetUrl));
      selfHostedFonts.push(...scanCssForSelfHostedFonts(css, stylesheetUrl));
    } catch {
      continue;
    }
  }

  return {
    pageUrl: parsedPageUrl.toString(),
    pageLang,
    fontCssUrls: dedupeGoogleFontsCssUrls(candidates),
    scannedStylesheets: fetchedStylesheets,
    ignoredDirectFontAssetCount: initialScan.ignoredDirectFontAssetCount,
    selfHostedFonts: dedupeSelfHostedFonts(selfHostedFonts),
  };
}

function mergeSinglePageResults(
  pages: SinglePageDiscoveryResult[],
  seedUrl: string,
  crawlMeta?: CrawlMeta
): WebsiteDiscoveryResult {
  const seedPage = pages.find((page) => page.pageUrl === seedUrl) ?? pages[0];
  const urlToPages = new Map<string, Set<string>>();
  const scannedStylesheets = new Set<string>();
  let ignoredDirectFontAssetCount = 0;
  const selfHostedFonts: SelfHostedFontAsset[] = [];

  for (const page of pages) {
    ignoredDirectFontAssetCount += page.ignoredDirectFontAssetCount;
    for (const sheet of page.scannedStylesheets) {
      scannedStylesheets.add(sheet);
    }
    selfHostedFonts.push(...page.selfHostedFonts);

    for (const cssUrl of page.fontCssUrls) {
      const normalized = normalizeGoogleFontsCssUrl(cssUrl) ?? cssUrl;
      const existing = urlToPages.get(normalized) ?? new Set<string>();
      existing.add(page.pageUrl);
      urlToPages.set(normalized, existing);
    }
  }

  return {
    pageUrl: seedUrl,
    pageLang: seedPage?.pageLang ?? null,
    recommendedSubsets: getRecommendedSubsetsForLang(seedPage?.pageLang ?? null),
    fontLinks: buildDiscoveredFontLinks(urlToPages),
    scannedStylesheets: [...scannedStylesheets].sort(),
    ignoredDirectFontAssetCount,
    selfHostedFonts: dedupeSelfHostedFonts(selfHostedFonts),
    crawlMeta,
  };
}

export async function discoverGoogleFontsFromWebsite(
  pageUrl: string,
  options?: CrawlOptions
): Promise<WebsiteDiscoveryResult> {
  if (!shouldCrawl(options)) {
    const single = await discoverFontsFromSinglePage(pageUrl);
    return mergeSinglePageResults([single], single.pageUrl, {
      enabled: false,
      seedUrl: single.pageUrl,
      pagesScanned: 1,
      pagesFailed: 0,
      maxPages: 1,
      maxDepth: 0,
      scannedPageUrls: [single.pageUrl],
    });
  }

  const crawl = await crawlSameOriginPages(pageUrl, options);
  const perPage: SinglePageDiscoveryResult[] = [];

  for (const page of crawl.pages) {
    perPage.push(await discoverFontsFromSinglePage(page.url, page.html));
  }

  return mergeSinglePageResults(perPage, crawl.seedUrl, crawl.crawlMeta);
}

export function formatDiscoveryMessage(result: WebsiteDiscoveryResult): string {
  const crawlMeta = result.crawlMeta;

  if (crawlMeta?.enabled) {
    const crawlLines = [
      `Crawled ${crawlMeta.pagesScanned} same-origin page(s) starting from ${crawlMeta.seedUrl}.`,
    ];

    if (crawlMeta.pagesFailed > 0) {
      crawlLines.push(`Failed to fetch ${crawlMeta.pagesFailed} page(s).`);
    }

    if (crawlMeta.limitReached === "maxPages") {
      crawlLines.push(`Stopped at max pages limit (${crawlMeta.maxPages}).`);
    } else if (crawlMeta.limitReached === "maxDepth") {
      crawlLines.push(`Some links were skipped at max depth (${crawlMeta.maxDepth}).`);
    }

    if (result.fontLinks.length === 0) {
      return [
        ...crawlLines,
        "",
        "No Google Fonts CSS links found across crawled pages.",
        "The site may use local fonts, system fonts, or JavaScript-injected fonts.",
        "Try a future rendered mode if fonts load only after JavaScript runs.",
        result.ignoredDirectFontAssetCount > 0
          ? `Ignored ${result.ignoredDirectFontAssetCount} direct font binary URL(s) from gstatic or similar sources.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const lines = [
      ...crawlLines,
      "",
      `Discovered ${result.fontLinks.length} unique Google Fonts stylesheet(s) across crawled pages:`,
      ...result.fontLinks.map((link) => {
        const pages =
          link.sourcePageUrls.length > 1
            ? ` (found on ${link.sourcePageUrls.length} pages)`
            : ` (found on ${link.sourcePageUrl})`;
        return `- ${link.url}${pages}`;
      }),
    ];

    if (result.scannedStylesheets.length > 0) {
      lines.push("", `Scanned ${result.scannedStylesheets.length} linked stylesheet(s).`);
    }

    if (result.ignoredDirectFontAssetCount > 0) {
      lines.push(
        `Ignored ${result.ignoredDirectFontAssetCount} direct font binary URL(s) (maps/widgets/preloads).`
      );
    }

    return lines.join("\n");
  }

  if (result.fontLinks.length === 0) {
    return [
      `No Google Fonts CSS links found on ${result.pageUrl}.`,
      "The page may use local fonts, system fonts, or JavaScript-injected fonts.",
      "Try a future rendered mode if fonts load only after JavaScript runs.",
      result.ignoredDirectFontAssetCount > 0
        ? `Ignored ${result.ignoredDirectFontAssetCount} direct font binary URL(s) from gstatic or similar sources.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [
    `Discovered ${result.fontLinks.length} Google Fonts stylesheet(s) on ${result.pageUrl}:`,
    ...result.fontLinks.map((link) => `- ${link.url}`),
  ];

  if (result.scannedStylesheets.length > 0) {
    lines.push("", `Scanned ${result.scannedStylesheets.length} linked stylesheet(s).`);
  }

  if (result.ignoredDirectFontAssetCount > 0) {
    lines.push(
      `Ignored ${result.ignoredDirectFontAssetCount} direct font binary URL(s) (maps/widgets/preloads).`
    );
  }

  return lines.join("\n");
}
