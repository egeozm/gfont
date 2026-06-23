#!/usr/bin/env node

import { Command } from "commander";
import path from "node:path";
import { discoverGoogleFontsFromWebsite, formatDiscoveryMessage } from "./discoverFonts.js";
import { formatSuccessMessage, localizeGoogleFonts } from "./localize.js";
import { formatLocalizeManyMessage, localizeFromWebsite } from "./localizeMany.js";
import { isGoogleFontsCssApiUrl, isGoogleFontsWebsiteUrl } from "./urlUtils.js";
import type { FontFormat } from "./types.js";

const VALID_FORMATS = new Set<FontFormat>(["woff2", "woff", "ttf"]);

function parseCommaList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFormats(value: string | undefined): FontFormat[] {
  const formats = parseCommaList(value) as FontFormat[];

  for (const format of formats) {
    if (!VALID_FORMATS.has(format)) {
      throw new Error(`Invalid format "${format}". Allowed values: woff2, woff, ttf.`);
    }
  }

  return formats.length > 0 ? formats : (["woff2", "woff", "ttf"] as FontFormat[]);
}

function isDirectGoogleFontsCssInput(url: string): boolean {
  return isGoogleFontsCssApiUrl(url);
}

function isWebsiteInput(url: string): boolean {
  if (isDirectGoogleFontsCssInput(url)) {
    return false;
  }

  try {
    const parsed = new URL(url.trim());
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

const program = new Command();

program
  .name("gfont-localize")
  .description("Self-host Google Fonts from a CSS URL or by scanning a website page")
  .argument("<url>", "Google Fonts CSS URL or website page URL")
  .option("-o, --out <dir>", "Base output directory; a subfolder is created from the font name(s)", "./output")
  .option("--css <path>", "Output CSS file path (default: <folder>/fonts.css)")
  .option("--formats <list>", "Comma-separated formats: woff2,woff,ttf", "woff2,woff,ttf")
  .option("--subsets <list>", "Comma-separated subsets to include (default: all returned)")
  .option("--prefix <str>", "URL prefix for generated src paths", "./")
  .option("--font-display <val>", "Override font-display in generated CSS")
  .option("--discovery <mode>", "Website discovery mode: static", "static")
  .option("--list-font-links", "Discover and print Google Fonts CSS links without downloading")
  .option("--from-website", "Force website discovery even if the URL looks like a Google Fonts host")
  .action(async (url: string, options) => {
    try {
      if (options.discovery !== "static") {
        throw new Error(`Unsupported discovery mode "${options.discovery}". Only "static" is available.`);
      }

      const localizeOptions = {
        baseDir: path.resolve(options.out),
        cssPath: options.css ?? null,
        formats: parseFormats(options.formats),
        subsets: parseCommaList(options.subsets),
        prefix: options.prefix ?? "./",
        fontDisplay: options.fontDisplay ?? null,
      };

      const shouldDiscoverWebsite =
        options.fromWebsite || (isWebsiteInput(url) && !isDirectGoogleFontsCssInput(url));

      if (shouldDiscoverWebsite) {
        if (options.listFontLinks) {
          const discovery = await discoverGoogleFontsFromWebsite(url);
          console.log(formatDiscoveryMessage(discovery));
          if (discovery.fontLinks.length === 0) {
            process.exitCode = 1;
          }
          return;
        }

        const result = await localizeFromWebsite({
          websiteUrl: url,
          ...localizeOptions,
        });

        console.log(formatLocalizeManyMessage(result));

        if (result.results.length === 0) {
          process.exitCode = 1;
        }
        return;
      }

      if (options.listFontLinks) {
        if (isDirectGoogleFontsCssInput(url)) {
          console.log(`Discovered 1 Google Fonts stylesheet(s):\n- ${url}`);
          return;
        }

        throw new Error(
          "Use a website URL with --list-font-links, or pass a direct Google Fonts CSS URL."
        );
      }

      if (isGoogleFontsWebsiteUrl(url) && !isDirectGoogleFontsCssInput(url)) {
        throw new Error(
          "URL points to fonts.googleapis.com but is not a /css or /css2 stylesheet. Pass the full CSS URL or use --from-website."
        );
      }

      const result = await localizeGoogleFonts({
        url,
        ...localizeOptions,
      });

      console.log(formatSuccessMessage(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
