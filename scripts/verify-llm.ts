import { adviseFontLicense, getHardcodedLlmAdvisor, resolveLlmAdvisorConfig, isLlmAdvisorEnabledFromEnv } from "../src/llmLicenseAdvisor.js";
import { analyzeInput } from "../src/analyzeFonts.js";

async function main() {
  const resolved = resolveLlmAdvisorConfig(undefined);
  console.log("=== Config check ===");
  console.log("hardcoded enabled:", Boolean(getHardcodedLlmAdvisor()));
  console.log("isLlmAdvisorEnabledFromEnv:", isLlmAdvisorEnabledFromEnv());
  console.log("resolved model:", resolved?.model);
  console.log("resolved apiUrl:", resolved?.apiUrl);
  console.log("has apiKey:", Boolean(resolved?.apiKey));

  console.log("\n=== Direct LLM call (unknown font) ===");
  const result = await adviseFontLicense({
    family: "Helvetica Neue Custom",
    sourceUrl: "https://example.com/fonts/helvetica-custom.woff2",
    evidence: ["No Google Fonts link", "Self-hosted woff2 on unknown domain"],
  });
  console.log("apiCalled:", result.apiCalled);
  console.log("aiAssisted:", result.aiAssisted);
  console.log("decision:", result.decision);
  console.log("rationale:", result.rationale.slice(0, 300));

  console.log("\n=== analyzeInput parkimlider.com ===");
  const analysis = await analyzeInput({
    url: "https://parkimlider.com",
    formats: ["woff2"],
    subsets: null,
    enableLlmAdvisor: true,
    llmAdvisor: getHardcodedLlmAdvisor(),
    crawl: { crawl: false, maxPages: 1, maxDepth: 0 },
  });
  console.log("llmResearch:", analysis.llmResearch);
  console.log("llmConsulted count:", analysis.familyLicenses.filter((l) => l.llmConsulted).length);
  for (const lic of analysis.familyLicenses) {
    console.log(" -", lic.family, "|", lic.status, "| llmConsulted:", lic.llmConsulted);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
