import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { MergedFontVariant } from "./types.js";

interface FontSample {
  family: string;
  weight: number;
  style: "normal" | "italic";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function formatSampleLabel(weight: number, style: "normal" | "italic"): string {
  const styleLabel = style === "italic" ? "italic" : "normal";
  return `${weight} ${styleLabel}`;
}

function collectFontSamples(variants: MergedFontVariant[]): FontSample[] {
  const seen = new Set<string>();
  const samples: FontSample[] = [];

  for (const variant of variants) {
    const key = `${variant.family}|${variant.weight}|${variant.style}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    samples.push({
      family: variant.family,
      weight: variant.weight,
      style: variant.style,
    });
  }

  return samples.sort((a, b) => {
    const familyCompare = a.family.localeCompare(b.family);
    if (familyCompare !== 0) return familyCompare;

    const weightCompare = a.weight - b.weight;
    if (weightCompare !== 0) return weightCompare;

    return a.style.localeCompare(b.style);
  });
}

function groupSamplesByFamily(samples: FontSample[]): Map<string, FontSample[]> {
  const grouped = new Map<string, FontSample[]>();

  for (const sample of samples) {
    const existing = grouped.get(sample.family) ?? [];
    existing.push(sample);
    grouped.set(sample.family, existing);
  }

  return grouped;
}

function renderFamilySection(family: string, samples: FontSample[]): string {
  const blocks = samples
    .map((sample) => {
      const familyCss = escapeCssString(sample.family);
      const label = escapeHtml(formatSampleLabel(sample.weight, sample.style));

      return `    <div class="sample">
      <span class="label">${label}</span>
      <p style="font-family: '${familyCss}', sans-serif; font-weight: ${sample.weight}; font-style: ${sample.style};">
        The quick brown fox jumps over the lazy dog.
      </p>
    </div>`;
    })
    .join("\n\n");

  return `  <section class="family-group">
    <h2>${escapeHtml(family)}</h2>
${blocks}
  </section>`;
}

export function generateTestHtml(families: string[], variants: MergedFontVariant[]): string {
  const samples = collectFontSamples(variants);
  const grouped = groupSamplesByFamily(samples);
  const titleFamilies = families.join(", ");
  const familySections = Array.from(grouped.entries())
    .map(([family, familySamples]) => renderFamilySection(family, familySamples))
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Local Font Test – ${escapeHtml(titleFamilies)}</title>
  <link rel="stylesheet" href="./fonts.css">
  <style>
    * { box-sizing: border-box; }

    body {
      font-size: 20px;
      line-height: 1.6;
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem;
      color: #1a1a1a;
      background: #fafafa;
    }

    h1 {
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .subtitle {
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .family-group {
      margin-bottom: 2rem;
    }

    .family-group h2 {
      font-size: 1.1rem;
      margin: 0 0 0.75rem;
      color: #333;
    }

    .sample {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }

    .label {
      display: block;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin-bottom: 0.35rem;
    }

    .checklist {
      margin-top: 2rem;
      padding: 1rem;
      background: #eef6ff;
      border-radius: 8px;
      font-size: 0.9rem;
    }

    .checklist h2 {
      font-size: 1rem;
      margin: 0 0 0.5rem;
    }

    .checklist ol {
      margin: 0;
      padding-left: 1.25rem;
    }
  </style>
</head>
<body>
  <h1>Local Font Test</h1>
  <p class="subtitle">Fonts loaded from <code>./fonts.css</code> in this folder (${escapeHtml(titleFamilies)}).</p>

${familySections}

  <div class="checklist">
    <h2>How to verify in DevTools</h2>
    <ol>
      <li>Open DevTools → <strong>Network</strong> → filter by <strong>Font</strong></li>
      <li>Reload the page — local <code>.woff2</code> files should load, not <code>fonts.gstatic.com</code></li>
      <li>In <strong>Elements → Computed → Rendered fonts</strong>, confirm the expected family names appear</li>
    </ol>
  </div>
</body>
</html>
`;
}

export async function writeTestHtml(
  outDir: string,
  families: string[],
  variants: MergedFontVariant[]
): Promise<string> {
  const testHtmlPath = path.join(outDir, "test.html");
  const html = generateTestHtml(families, variants);
  await writeFile(testHtmlPath, html, "utf8");
  return testHtmlPath;
}
