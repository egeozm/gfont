import PDFDocument from "pdfkit";
import type { FontLicenseInfo, LlmResearchMeta, WebsiteReportInput } from "./types.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 512;

const COLORS = {
  text: "#152033",
  muted: "#5b6475",
  border: "#dbe1ec",
  badgeFree: "#067647",
  badgeFreeBg: "#ecfdf3",
  badgeUnknown: "#b54708",
  badgeUnknownBg: "#fff7db",
  badgeRestricted: "#b42318",
  badgeRestrictedBg: "#fef3f2",
  badgeConfidence: "#475467",
  badgeConfidenceBg: "#f8fafc",
  badgeLlmInconclusive: "#b54708",
  badgeLlmInconclusiveBg: "#fff7db",
  badgeLlmEscalated: "#6941c6",
  badgeLlmEscalatedBg: "#f4f3ff",
  badgeLlmNotUsed: "#475467",
  badgeLlmNotUsedBg: "#f2f4f7",
  aiTag: "#6941c6",
};

function getLlmResearchSummary(license: FontLicenseInfo): string {
  const evidence = license.evidence ?? [];
  const apiHostLine = evidence.find((item) => item.startsWith("LLM API host:"));
  const apiHost = apiHostLine ? apiHostLine.replace("LLM API host:", "").trim() : "";

  if (license.llmConsulted) {
    const hostHint = apiHost ? ` via ${apiHost}` : "";
    if (license.detectionMethod === "llm_advisor") {
      return `AI research: consulted${hostHint} — flagged restricted`;
    }
    return `AI research: consulted${hostHint} — inconclusive`;
  }

  if (license.detectionMethod !== "fallback") {
    return "AI research: not used (automatic detection)";
  }

  if (evidence.some((item) => item.includes("AI research was not enabled for this analysis."))) {
    return "AI research: not enabled";
  }

  if (evidence.some((item) => item.includes("AI research was enabled but API URL or key is missing."))) {
    return "AI research: enabled but missing API URL or key";
  }

  if (evidence.some((item) => item.startsWith("LLM advisor:"))) {
    return "AI research: enabled but request failed";
  }

  return "AI research: not enabled";
}

function getLlmBadgeColors(license: FontLicenseInfo): { fill: string; text: string } {
  if (license.llmConsulted) {
    if (license.detectionMethod === "llm_advisor") {
      return { fill: COLORS.badgeLlmEscalatedBg, text: COLORS.badgeLlmEscalated };
    }
    return { fill: COLORS.badgeLlmInconclusiveBg, text: COLORS.badgeLlmInconclusive };
  }
  return { fill: COLORS.badgeLlmNotUsedBg, text: COLORS.badgeLlmNotUsed };
}

function getStatusBadgeColors(status: FontLicenseInfo["status"]): { fill: string; text: string } {
  switch (status) {
    case "free":
      return { fill: COLORS.badgeFreeBg, text: COLORS.badgeFree };
    case "restricted":
      return { fill: COLORS.badgeRestrictedBg, text: COLORS.badgeRestricted };
    default:
      return { fill: COLORS.badgeUnknownBg, text: COLORS.badgeUnknown };
  }
}

function formatLlmResearchOverview(llmResearch?: LlmResearchMeta): string[] {
  if (!llmResearch?.requested) {
    return ["AI license research was not requested for this analysis."];
  }

  if (!llmResearch.active) {
    return ["AI license research was requested but is not active (missing API URL or key)."];
  }

  const provider =
    llmResearch.provider === "gemini"
      ? "Google Gemini"
      : llmResearch.provider === "groq"
        ? "Groq"
        : "OpenAI-compatible API";

  return [
    `AI license research: active (${provider})`,
    llmResearch.apiHost ? `API host: ${llmResearch.apiHost}` : "",
    llmResearch.model ? `Model: ${llmResearch.model}` : "",
    typeof llmResearch.llmCallCount === "number"
      ? `LLM API calls made: ${llmResearch.llmCallCount}`
      : "LLM API calls made: 0 (automatic detection handled all fonts)",
  ].filter(Boolean);
}

function drawBadge(
  doc: PdfDoc,
  x: number,
  y: number,
  label: string,
  colors: { fill: string; text: string }
): number {
  doc.font("Helvetica-Bold").fontSize(8);
  const textWidth = doc.widthOfString(label);
  const paddingX = 8;
  const badgeWidth = textWidth + paddingX * 2;
  const badgeHeight = 16;

  doc.roundedRect(x, y, badgeWidth, badgeHeight, 8).fill(colors.fill);
  doc.fillColor(colors.text).text(label, x + paddingX, y + 4, { lineBreak: false });

  return badgeWidth;
}

function drawField(doc: PdfDoc, label: string, value: string, y: number): number {
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text(`${label}:`, PAGE_MARGIN, y, {
    width: CONTENT_WIDTH,
  });
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10).text(value, PAGE_MARGIN, doc.y + 2, {
    width: CONTENT_WIDTH,
  });
  return doc.y + 6;
}

function ensureSpace(doc: PdfDoc, neededHeight: number): void {
  const bottom = doc.page.height - PAGE_MARGIN;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function drawLicenseCard(doc: PdfDoc, license: FontLicenseInfo): void {
  ensureSpace(doc, 180);

  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(14).text(license.family, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.y += 4;

  let badgeX = PAGE_MARGIN;
  const badgeY = doc.y;
  const statusColors = getStatusBadgeColors(license.status);
  const statusWidth = drawBadge(doc, badgeX, badgeY, license.statusLabel, statusColors);
  badgeX += statusWidth + 6;

  if (license.confidence) {
    drawBadge(doc, badgeX, badgeY, `${license.confidence} confidence`, {
      fill: COLORS.badgeConfidenceBg,
      text: COLORS.badgeConfidence,
    });
  }

  doc.y = badgeY + 24;

  doc.y = drawField(doc, "Source", license.source, doc.y);
  doc.y = drawField(doc, "License", license.license, doc.y);
  doc.y = drawField(doc, "Commercial use", license.commercialUse, doc.y);

  const llmSummary = getLlmResearchSummary(license);
  const llmColors = getLlmBadgeColors(license);
  ensureSpace(doc, 24);
  const llmY = doc.y;
  drawBadge(doc, PAGE_MARGIN, llmY, llmSummary, llmColors);
  doc.y = llmY + 22;

  if (license.confidence) {
    doc.y = drawField(doc, "Confidence", license.confidence, doc.y);
  }

  if (license.detectionMethod) {
    doc.y = drawField(doc, "Detection", license.detectionMethod, doc.y);
  }

  if (license.aiAssisted) {
    doc.fillColor(COLORS.aiTag).font("Helvetica-Bold").fontSize(9).text("AI-assisted — not legal advice", PAGE_MARGIN, doc.y);
    doc.y += 14;
  }

  if (license.notes) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(license.notes, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    doc.y += 6;
  }

  if (license.references?.length) {
    ensureSpace(doc, 40);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text("References", PAGE_MARGIN, doc.y);
    doc.y += 14;

    for (const ref of license.references) {
      ensureSpace(doc, 30);
      const refLine = ref.href
        ? `• ${ref.title}: ${ref.href}${ref.detail ? ` — ${ref.detail}` : ""}`
        : `• ${ref.title}${ref.detail ? ` — ${ref.detail}` : ""}`;
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(refLine, PAGE_MARGIN + 8, doc.y, {
        width: CONTENT_WIDTH - 8,
      });
      doc.y += 4;
    }
  }

  if (license.evidence?.length) {
    ensureSpace(doc, 40);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text("Why?", PAGE_MARGIN, doc.y);
    doc.y += 14;

    for (const item of license.evidence) {
      ensureSpace(doc, 30);
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(`• ${item}`, PAGE_MARGIN + 8, doc.y, {
        width: CONTENT_WIDTH - 8,
      });
      doc.y += 4;
    }
  }

  doc.y += 10;
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();
  doc.y += 16;
}

export function buildWebsiteReportPdfFilename(inputUrl: string): string {
  try {
    const hostname = new URL(inputUrl).hostname.replace(/^www\./, "");
    const safe = hostname.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/-+/g, "-");
    return `${safe || "website"}-font-report.pdf`;
  } catch {
    return "website-font-report.pdf";
  }
}

export async function generateWebsiteReportPdf(input: WebsiteReportInput): Promise<Buffer> {
  const selectedIds = input.selectedVariantIds ?? input.variants.map((v) => v.id);
  const selectedCount = input.variants.filter((v) => selectedIds.includes(v.id)).length;
  const licenses = input.familyLicenses.length > 0 ? input.familyLicenses : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PAGE_MARGIN,
      size: "A4",
      info: {
        Title: "Website Font Report",
        Author: "gfont-localize",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(20).text("Website Font Report");
    doc.moveDown(0.3);
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text("Generated by Google Fonts Localizer");
    doc.moveDown(1);

    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(12).text("Overview");
    doc.moveDown(0.4);
    doc.y = drawField(doc, "Scanned URL", input.inputUrl, doc.y);
    doc.y = drawField(
      doc,
      "Scan type",
      input.inputType === "website" ? "Website page" : "Direct Google Fonts CSS URL",
      doc.y
    );
    doc.y = drawField(doc, "Report generated", new Date().toLocaleString(), doc.y);
    doc.y = drawField(
      doc,
      "Google Fonts CSS links found",
      String(input.discoveredFontCssUrls.length),
      doc.y
    );
    doc.y = drawField(
      doc,
      "Selectable variants",
      `${input.variants.length} total · ${selectedCount} selected`,
      doc.y
    );

    if (input.inputType === "website" && input.pageLang) {
      doc.y = drawField(doc, "Page language", `${input.pageLang} (seed page HTML)`, doc.y);
    }

    if (input.crawlMeta?.enabled) {
      doc.moveDown(0.5);
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text("Site crawl");
      doc.moveDown(0.3);
      doc.y = drawField(doc, "Seed URL", input.crawlMeta.seedUrl, doc.y);
      doc.y = drawField(doc, "Pages scanned", String(input.crawlMeta.pagesScanned), doc.y);
      doc.y = drawField(doc, "Pages failed", String(input.crawlMeta.pagesFailed), doc.y);
      if (input.crawlMeta.limitReached) {
        doc.y = drawField(doc, "Limit reached", input.crawlMeta.limitReached, doc.y);
      }
      if (input.crawlMeta.scannedPageUrls.length > 0) {
        ensureSpace(doc, 24);
        doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text("Scanned pages", PAGE_MARGIN, doc.y);
        doc.moveDown(0.2);
        for (const pageUrl of input.crawlMeta.scannedPageUrls.slice(0, 20)) {
          ensureSpace(doc, 24);
          doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(`• ${pageUrl}`, PAGE_MARGIN, doc.y, {
            width: CONTENT_WIDTH,
          });
          doc.y += 2;
        }
        if (input.crawlMeta.scannedPageUrls.length > 20) {
          doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(
            `… and ${input.crawlMeta.scannedPageUrls.length - 20} more`,
            PAGE_MARGIN,
            doc.y
          );
        }
      }
    }

    if (input.discoveredFontCssUrls.length > 0) {
      doc.moveDown(0.5);
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text("Discovered Google Fonts links");
      doc.moveDown(0.3);
      for (const url of input.discoveredFontCssUrls) {
        ensureSpace(doc, 24);
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(`• ${url}`, PAGE_MARGIN, doc.y, {
          width: CONTENT_WIDTH,
        });
        doc.y += 2;
      }
    }

    doc.moveDown(0.8);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(12).text("AI license research");
    doc.moveDown(0.4);
    for (const line of formatLlmResearchOverview(input.llmResearch)) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(`• ${line}`, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
      });
      doc.y += 2;
    }

    doc.moveDown(1);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(12).text("Font license analysis");
    doc.moveDown(0.2);
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(
      "Detailed results for each detected font family. This report is informational only and is not legal advice.",
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH }
    );
    doc.moveDown(0.8);

    if (licenses.length === 0) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text("No font families were detected.", PAGE_MARGIN, doc.y);
    } else {
      for (const license of licenses) {
        drawLicenseCard(doc, license);
      }
    }

    doc.moveDown(0.5);
    doc.fillColor(COLORS.muted).font("Helvetica-Oblique").fontSize(8).text(
      "Review license details before using fonts in production. Confirm you have the right to self-host each font.",
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH }
    );

    doc.end();
  });
}
