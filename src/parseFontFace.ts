import postcss from "postcss";
import type { FontFormat, FontVariant } from "./types.js";

const FORMAT_ORDER: FontFormat[] = ["woff2", "woff", "ttf"];

function normalizeFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function normalizeStyle(value: string | undefined): "normal" | "italic" {
  return value === "italic" ? "italic" : "normal";
}

function normalizeWeight(value: string | undefined): number {
  if (!value) {
    return 400;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function detectFormatFromUrl(url: string): FontFormat | null {
  const lower = url.toLowerCase();
  if (lower.includes(".woff2")) return "woff2";
  if (lower.includes(".woff")) return "woff";
  if (lower.includes(".ttf") || lower.includes(".truetype")) return "ttf";
  return null;
}

function detectFormatFromDeclaration(value: string): FontFormat | null {
  const lower = value.toLowerCase();
  if (lower.includes("format('woff2')") || lower.includes('format("woff2")')) return "woff2";
  if (lower.includes("format('woff')") || lower.includes('format("woff")')) return "woff";
  if (
    lower.includes("format('truetype')") ||
    lower.includes('format("truetype")') ||
    lower.includes("format('ttf')") ||
    lower.includes('format("ttf")')
  ) {
    return "ttf";
  }
  return null;
}

function extractSrcUrls(srcValue: string): Array<{ url: string; format: FontFormat | null }> {
  const results: Array<{ url: string; format: FontFormat | null }> = [];
  const urlRegex = /url\((['"]?)([^)'"]+)\1\)(?:\s+format\((['"])([^'"]+)\3\))?/gi;

  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(srcValue)) !== null) {
    const url = match[2]?.trim();
    if (!url) continue;

    const formatFromDeclaration = match[4] ? detectFormatFromDeclaration(`format('${match[4]}')`) : null;
    const format = formatFromDeclaration ?? detectFormatFromUrl(url);
    results.push({ url, format });
  }

  return results;
}

function extractSubsetFromComment(commentText: string): string {
  const trimmed = commentText.trim();
  const match = trimmed.match(/^([a-z0-9-]+)/i);
  return match?.[1] ?? "unknown";
}

export function parseFontFaceCss(css: string, format: FontFormat): FontVariant[] {
  const root = postcss.parse(css);
  const variants: FontVariant[] = [];
  let currentSubset = "unknown";

  for (const node of root.nodes) {
    if (node.type === "comment") {
      currentSubset = extractSubsetFromComment(node.text);
      continue;
    }

    if (node.type !== "atrule" || node.name !== "font-face") {
      continue;
    }

    const declarations = new Map<string, string>();
    node.walkDecls((decl) => {
      declarations.set(decl.prop.toLowerCase(), decl.value);
    });

    const family = declarations.get("font-family");
    const src = declarations.get("src");
    if (!family || !src) {
      continue;
    }

    const srcEntries = extractSrcUrls(src);
    for (const entry of srcEntries) {
      variants.push({
        family: normalizeFamily(family),
        style: normalizeStyle(declarations.get("font-style")),
        weight: normalizeWeight(declarations.get("font-weight")),
        subset: currentSubset,
        fontDisplay: declarations.get("font-display") ?? null,
        unicodeRange: declarations.get("unicode-range") ?? null,
        format: entry.format ?? format,
        srcUrl: entry.url,
      });
    }
  }

  return variants.filter((variant) => FORMAT_ORDER.includes(variant.format));
}

export function parseFontFaceCssForFormats(
  cssByFormat: Map<FontFormat, string>
): FontVariant[] {
  const allVariants: FontVariant[] = [];

  for (const [format, css] of cssByFormat.entries()) {
    allVariants.push(...parseFontFaceCss(css, format));
  }

  return allVariants;
}
