import postcss from "postcss";
import { crawlSameOriginPages, shouldCrawl } from "./crawlWebsite.js";
import {
  scanCssForSelfHostedFonts,
  scanHtmlForGoogleFonts,
} from "./discoverFonts.js";
import { fetchTextWithTimeout } from "./fetchUtils.js";
import type { CrawlMeta, CrawlOptions } from "./types.js";

const STYLE_BLOCK_REGEX = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const INLINE_STYLE_ATTR_REGEX = /\bstyle\s*=\s*(['"])([\s\S]*?)\1/gi;
const FONT_FAMILY_DECL_REGEX = /font-family\s*:\s*([^;{}]+)/gi;

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function splitFontFamilyList(value: string): string[] {
  const families: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ",") {
      const trimmed = stripQuotes(current);
      if (trimmed) {
        families.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = stripQuotes(current);
  if (trimmed) {
    families.push(trimmed);
  }

  return families;
}

function addFontFamilyDeclarations(value: string, families: Set<string>): void {
  for (const family of splitFontFamilyList(value)) {
    families.add(family);
  }
}

export function extractFontFamiliesFromCss(css: string): string[] {
  const families = new Set<string>();

  try {
    const root = postcss.parse(css);
    root.walkDecls("font-family", (decl) => {
      addFontFamilyDeclarations(decl.value, families);
    });
  } catch {
    let match: RegExpExecArray | null;
    while ((match = FONT_FAMILY_DECL_REGEX.exec(css)) !== null) {
      addFontFamilyDeclarations(match[1] ?? "", families);
    }
  }

  return [...families];
}

function extractInlineStyleAttributeValues(html: string): string[] {
  const values: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = INLINE_STYLE_ATTR_REGEX.exec(html)) !== null) {
    const value = match[2]?.trim();
    if (value) {
      values.push(value);
    }
  }

  return values;
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

export function extractFontFamiliesFromHtml(html: string): string[] {
  const families = new Set<string>();

  for (const block of extractInlineStyleBlocks(html)) {
    for (const family of extractFontFamiliesFromCss(block)) {
      families.add(family);
    }
  }

  for (const inlineStyle of extractInlineStyleAttributeValues(html)) {
    let match: RegExpExecArray | null;
    while ((match = FONT_FAMILY_DECL_REGEX.exec(inlineStyle)) !== null) {
      addFontFamilyDeclarations(match[1] ?? "", families);
    }
  }

  return [...families];
}

export interface FontReferenceDiscoveryResult {
  pageUrl: string;
  references: Set<string>;
  crawlMeta?: CrawlMeta;
}

async function collectFontReferencesFromPage(pageUrl: string, html: string): Promise<Set<string>> {
  const references = new Set<string>();

  for (const family of extractFontFamiliesFromHtml(html)) {
    references.add(family);
  }

  const scan = scanHtmlForGoogleFonts(html, pageUrl);
  for (const asset of scan.selfHostedFonts) {
    references.add(asset.family);
  }

  const fetchedStylesheets = new Set<string>();
  for (const stylesheetUrl of scan.stylesheetUrls) {
    if (fetchedStylesheets.has(stylesheetUrl)) {
      continue;
    }

    fetchedStylesheets.add(stylesheetUrl);

    try {
      const css = await fetchTextWithTimeout(stylesheetUrl);
      for (const family of extractFontFamiliesFromCss(css)) {
        references.add(family);
      }

      for (const asset of scanCssForSelfHostedFonts(css, stylesheetUrl)) {
        references.add(asset.family);
      }
    } catch {
      continue;
    }
  }

  return references;
}

export async function discoverFontReferencesFromWebsite(
  pageUrl: string,
  options?: CrawlOptions
): Promise<FontReferenceDiscoveryResult> {
  const references = new Set<string>();
  const trimmedUrl = pageUrl.trim();

  if (!shouldCrawl(options)) {
    const html = await fetchTextWithTimeout(trimmedUrl);
    const pageReferences = await collectFontReferencesFromPage(trimmedUrl, html);
    for (const family of pageReferences) {
      references.add(family);
    }

    return {
      pageUrl: trimmedUrl,
      references,
      crawlMeta: {
        enabled: false,
        seedUrl: trimmedUrl,
        pagesScanned: 1,
        pagesFailed: 0,
        maxPages: 1,
        maxDepth: 0,
        scannedPageUrls: [trimmedUrl],
      },
    };
  }

  const crawl = await crawlSameOriginPages(trimmedUrl, options);

  for (const page of crawl.pages) {
    const pageReferences = await collectFontReferencesFromPage(page.url, page.html);
    for (const family of pageReferences) {
      references.add(family);
    }
  }

  return {
    pageUrl: crawl.seedUrl,
    references,
    crawlMeta: crawl.crawlMeta,
  };
}
