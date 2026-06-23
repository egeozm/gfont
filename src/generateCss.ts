import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { FontFormat, LocalFontFile, MergedFontVariant } from "./types.js";

const FORMAT_ORDER: FontFormat[] = ["woff2", "woff", "ttf"];

const FORMAT_DECLARATIONS: Record<FontFormat, string> = {
  woff2: "format('woff2')",
  woff: "format('woff')",
  ttf: "format('truetype')",
};

function escapeCssString(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function normalizePrefix(prefix: string): string {
  if (!prefix) {
    return "./";
  }

  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function buildSrcList(
  variant: MergedFontVariant,
  formats: FontFormat[],
  prefix: string,
  urlToFilename: Map<string, string>
): string {
  const entries: string[] = [];

  for (const format of formats) {
    const remoteUrl = variant.sources[format];
    if (!remoteUrl) {
      continue;
    }

    const filename = urlToFilename.get(remoteUrl);
    if (!filename) {
      continue;
    }

    entries.push(`url(${prefix}${filename}) ${FORMAT_DECLARATIONS[format]}`);
  }

  return entries.join(",\n    ");
}

function buildFontFaceRule(
  variant: MergedFontVariant,
  formats: FontFormat[],
  prefix: string,
  fontDisplayOverride: string | null,
  urlToFilename: Map<string, string>
): string {
  const lines = [
    `/* ${variant.subset} */`,
    "@font-face {",
    `  font-family: ${escapeCssString(variant.family)};`,
    `  font-style: ${variant.style};`,
    `  font-weight: ${variant.weight};`,
  ];

  const fontDisplay = fontDisplayOverride ?? variant.fontDisplay;
  if (fontDisplay) {
    lines.push(`  font-display: ${fontDisplay};`);
  }

  lines.push(`  src: ${buildSrcList(variant, formats, prefix, urlToFilename)};`);

  if (variant.unicodeRange) {
    lines.push(`  unicode-range: ${variant.unicodeRange};`);
  }

  lines.push("}");

  return lines.join("\n");
}

export function generateLocalCss(
  variants: MergedFontVariant[],
  formats: FontFormat[],
  prefix: string,
  fontDisplayOverride: string | null,
  urlToFilename: Map<string, string>
): string {
  const normalizedPrefix = normalizePrefix(prefix);
  const blocks = variants.map((variant) =>
    buildFontFaceRule(variant, formats, normalizedPrefix, fontDisplayOverride, urlToFilename)
  );

  return `${blocks.join("\n\n")}\n`;
}

export async function writeLocalCssFile(
  cssPath: string,
  variants: MergedFontVariant[],
  formats: FontFormat[],
  prefix: string,
  fontDisplayOverride: string | null,
  urlToFilename: Map<string, string>
): Promise<void> {
  const css = generateLocalCss(variants, formats, prefix, fontDisplayOverride, urlToFilename);
  await writeFile(cssPath, css, "utf8");
}

export function summarizeDownloads(files: LocalFontFile[]): string {
  const uniqueByFormat = new Map<FontFormat, Set<string>>();

  for (const file of files) {
    const filenames = uniqueByFormat.get(file.format) ?? new Set<string>();
    filenames.add(file.filename);
    uniqueByFormat.set(file.format, filenames);
  }

  const parts = FORMAT_ORDER.filter((format) => uniqueByFormat.has(format)).map(
    (format) => `${uniqueByFormat.get(format)!.size} ${format}`
  );

  return parts.join(", ");
}

export function resolveCssPath(outDir: string, cssPath: string | undefined): string {
  if (!cssPath) {
    return path.join(outDir, "fonts.css");
  }

  return path.isAbsolute(cssPath) ? cssPath : path.resolve(cssPath);
}
