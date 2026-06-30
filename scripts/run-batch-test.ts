import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { analyzeInput } from "../src/analyzeFonts.js";
import { analyzeResultToReportInput, readSitesFromFile } from "../src/batch.js";
import {
  buildWebsiteReportPdfFilename,
  generateWebsiteReportPdf,
} from "../src/generateWebsiteReportPdf.js";

const sitesFile = process.argv[2] ?? "/Users/egeozm/Desktop/gfont/test-sites-2.txt";
const maxDepth = Number.parseInt(process.argv[3] ?? "1000", 10);
const maxPages = Number.parseInt(process.argv[4] ?? "1000", 10);
const outDir = path.resolve(process.argv[5] ?? "/Users/egeozm/Desktop/gfont/output");
const limit = Number.parseInt(process.argv[6] ?? "2", 10);

const sites = (await readSitesFromFile(sitesFile)).slice(0, limit);
const reportsDir = path.join(outDir, "reports");
await mkdir(reportsDir, { recursive: true });

console.log(`Processing ${sites.length} site(s) from ${sitesFile}`);
console.log(`Max depth: ${maxDepth}, max pages: ${maxPages}`);
console.log(`Reports dir: ${reportsDir}\n`);

for (let i = 0; i < sites.length; i++) {
  const url = sites[i];
  const progress = `[${i + 1}/${sites.length}]`;
  console.log(`${progress} Analyzing ${url}...`);

  try {
    const analysis = await analyzeInput({
      url,
      formats: ["woff2", "woff", "ttf"],
      subsets: null,
      crawl: { crawl: true, maxPages, maxDepth },
    });

    const reportInput = analyzeResultToReportInput(analysis, ["woff2", "woff", "ttf"]);
    const pdfBuffer = await generateWebsiteReportPdf(reportInput);
    const filename = buildWebsiteReportPdfFilename(analysis.inputUrl);
    const reportPath = path.join(reportsDir, filename);
    await writeFile(reportPath, pdfBuffer);
    console.log(`${progress} Saved: ${reportPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${progress} Failed: ${message}`);
  }
}

console.log("\nDone.");
