import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeInput, getDefaultSelectedVariantIds } from "./analyzeFonts.js";
import { exportSelectionToZip } from "./exportSelection.js";
import {
  buildWebsiteReportPdfFilename,
  generateWebsiteReportPdf,
} from "./generateWebsiteReportPdf.js";
import { isLlmAdvisorEnabled, isLlmAdvisorEnabledFromEnv } from "./llmLicenseAdvisor.js";
import type { ExportInstallContext, FontFormat, LlmAdvisorConfig, WebsiteReportInput } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "../web");
const DEFAULT_PORT = 3847;

const VALID_FORMATS = new Set<FontFormat>(["woff2", "woff", "ttf"]);

function parseFormats(formats: unknown): FontFormat[] {
  if (!Array.isArray(formats)) {
    return ["woff2", "woff", "ttf"];
  }

  const parsed = formats.filter((format): format is FontFormat =>
    typeof format === "string" && VALID_FORMATS.has(format as FontFormat)
  );

  return parsed.length > 0 ? parsed : ["woff2", "woff", "ttf"];
}

function parseSubsets(subsets: unknown): string[] | null {
  if (!Array.isArray(subsets)) {
    return null;
  }

  const parsed = subsets.filter(
    (subset): subset is string => typeof subset === "string" && subset.trim().length > 0
  );
  return parsed.length > 0 ? parsed : null;
}

function parseLlmAdvisor(body: {
  enableLlmAdvisor?: boolean;
  llmAdvisor?: LlmAdvisorConfig;
}): { enableLlmAdvisor?: boolean; llmAdvisor?: LlmAdvisorConfig } {
  const llmAdvisor =
    body.llmAdvisor && typeof body.llmAdvisor === "object"
      ? {
          enabled:
            typeof body.llmAdvisor.enabled === "boolean" ? body.llmAdvisor.enabled : undefined,
          apiUrl:
            typeof body.llmAdvisor.apiUrl === "string" ? body.llmAdvisor.apiUrl.trim() : undefined,
          apiKey:
            typeof body.llmAdvisor.apiKey === "string" ? body.llmAdvisor.apiKey.trim() : undefined,
          model:
            typeof body.llmAdvisor.model === "string" ? body.llmAdvisor.model.trim() : undefined,
        }
      : undefined;

  return {
    enableLlmAdvisor:
      typeof body.enableLlmAdvisor === "boolean" ? body.enableLlmAdvisor : undefined,
    llmAdvisor,
  };
}

export async function createServer() {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({
    ok: true,
    features: {
      pdfReport: true,
      zipExport: true,
    },
    llmAdvisorEnabled: isLlmAdvisorEnabledFromEnv(),
    llmAdvisorEnvConfigured: isLlmAdvisorEnabled(),
  }));

  app.post("/api/analyze", async (request, reply) => {
    const body = request.body as {
      url?: string;
      formats?: FontFormat[];
      subsets?: string[];
      enableLlmAdvisor?: boolean;
      llmAdvisor?: LlmAdvisorConfig;
    };

    if (!body?.url || typeof body.url !== "string") {
      return reply.status(400).send({ error: "URL is required." });
    }

    try {
      const llmOptions = parseLlmAdvisor(body);
      const result = await analyzeInput({
        url: body.url,
        formats: parseFormats(body.formats),
        subsets: parseSubsets(body.subsets),
        enableLlmAdvisor: llmOptions.enableLlmAdvisor,
        llmAdvisor: llmOptions.llmAdvisor,
      });

      return {
        ...result,
        defaultSelectedVariantIds: getDefaultSelectedVariantIds(
          result.variants,
          result.recommendedSubsets
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/api/export", async (request, reply) => {
    const body = request.body as {
      variants?: unknown;
      selectedVariantIds?: string[];
      formats?: FontFormat[];
      fontDisplay?: string | null;
      prefix?: string;
      zipName?: string;
      familyLicenses?: unknown;
      acknowledgeLicenseRisk?: boolean;
      installContext?: ExportInstallContext;
      reportContext?: WebsiteReportInput;
    };

    if (!Array.isArray(body?.variants) || !Array.isArray(body?.selectedVariantIds)) {
      return reply.status(400).send({ error: "variants and selectedVariantIds are required." });
    }

    try {
      const installContext =
        body.installContext &&
        typeof body.installContext.inputUrl === "string" &&
        (body.installContext.inputType === "website" ||
          body.installContext.inputType === "googleFontsCss")
          ? {
              inputUrl: body.installContext.inputUrl,
              inputType: body.installContext.inputType,
              discoveredFontCssUrls: Array.isArray(body.installContext.discoveredFontCssUrls)
                ? body.installContext.discoveredFontCssUrls.filter(
                    (url): url is string => typeof url === "string"
                  )
                : [],
            }
          : undefined;

      const result = await exportSelectionToZip({
        variants: body.variants as never,
        selectedVariantIds: body.selectedVariantIds,
        formats: parseFormats(body.formats),
        fontDisplay: body.fontDisplay ?? null,
        prefix: body.prefix,
        zipName: body.zipName,
        familyLicenses: Array.isArray(body.familyLicenses) ? (body.familyLicenses as never) : [],
        acknowledgeLicenseRisk: body.acknowledgeLicenseRisk === true,
        installContext,
        reportContext: body.reportContext,
      });

      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${result.zipName}"`)
        .send(result.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/api/report", async (request, reply) => {
    const body = request.body as Partial<WebsiteReportInput>;

    if (!body?.inputUrl || typeof body.inputUrl !== "string") {
      return reply.status(400).send({ error: "inputUrl is required." });
    }

    if (!Array.isArray(body.variants)) {
      return reply.status(400).send({ error: "variants are required." });
    }

    try {
      const reportInput: WebsiteReportInput = {
        inputUrl: body.inputUrl,
        inputType:
          body.inputType === "website" || body.inputType === "googleFontsCss"
            ? body.inputType
            : "website",
        discoveredFontCssUrls: Array.isArray(body.discoveredFontCssUrls)
          ? body.discoveredFontCssUrls.filter((url): url is string => typeof url === "string")
          : [],
        ignoredDirectFontAssetCount:
          typeof body.ignoredDirectFontAssetCount === "number"
            ? body.ignoredDirectFontAssetCount
            : 0,
        scannedStylesheets: Array.isArray(body.scannedStylesheets)
          ? body.scannedStylesheets.filter((url): url is string => typeof url === "string")
          : undefined,
        pageLang: typeof body.pageLang === "string" ? body.pageLang : body.pageLang ?? null,
        recommendedSubsets: Array.isArray(body.recommendedSubsets)
          ? body.recommendedSubsets.filter((s): s is string => typeof s === "string")
          : undefined,
        variants: body.variants as never,
        selectedVariantIds: Array.isArray(body.selectedVariantIds)
          ? body.selectedVariantIds.filter((id): id is string => typeof id === "string")
          : undefined,
        familyLicenses: Array.isArray(body.familyLicenses) ? (body.familyLicenses as never) : [],
        llmResearch: body.llmResearch,
        formats: parseFormats(body.formats),
      };

      const pdfBuffer = await generateWebsiteReportPdf(reportInput);
      const filename = buildWebsiteReportPdfFilename(reportInput.inputUrl);

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdfBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(400).send({ error: message });
    }
  });

  await app.register(fastifyStatic, {
    root: WEB_ROOT,
    prefix: "/",
  });

  return app;
}

export async function startServer(port = DEFAULT_PORT) {
  const app = await createServer();
  await app.listen({ port, host: "127.0.0.1" });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer(Number(process.env.PORT ?? DEFAULT_PORT))
    .then((app) => {
      const address = app.server.address();
      const resolvedPort =
        typeof address === "object" && address ? address.port : DEFAULT_PORT;
      console.log(`Web UI running at http://127.0.0.1:${resolvedPort}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
