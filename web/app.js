const analyzeForm = document.getElementById("analyze-form");
const inputUrl = document.getElementById("input-url");
const inputSubsets = document.getElementById("input-subsets");
const statusEl = document.getElementById("status");
const discoveryCard = document.getElementById("discovery-card");
const discoveryContent = document.getElementById("discovery-content");
const selectionCard = document.getElementById("selection-card");
const previewCard = document.getElementById("preview-card");
const exportCard = document.getElementById("export-card");
const familiesContainer = document.getElementById("families-container");
const previewContainer = document.getElementById("preview-container");
const previewFormatSelect = document.getElementById("preview-format");
const previewCountEl = document.getElementById("preview-count");
const exportSummary = document.getElementById("export-summary");
const licenseWarningEl = document.getElementById("license-warning");
const installInstructions = document.getElementById("install-instructions");
const installSteps = document.getElementById("install-steps");
const installLinksToRemove = document.getElementById("install-links-to-remove");
const installRemoveList = document.getElementById("install-remove-list");
const exportBtn = document.getElementById("export-btn");
const reportBtn = document.getElementById("report-btn");
const selectAllBtn = document.getElementById("select-all-btn");
const selectLatinBtn = document.getElementById("select-latin-btn");
const selectRecommendedBtn = document.getElementById("select-recommended-btn");
const toggleSubsetsBtn = document.getElementById("toggle-subsets-btn");
const clearBtn = document.getElementById("clear-btn");
const llmEnabledInput = document.getElementById("llm-enabled");
const llmApiUrlInput = document.getElementById("llm-api-url");
const llmApiKeyInput = document.getElementById("llm-api-key");
const llmModelInput = document.getElementById("llm-model");
const llmSettingsStatus = document.getElementById("llm-settings-status");
const llmSaveBtn = document.getElementById("llm-save-btn");
const llmClearBtn = document.getElementById("llm-clear-btn");

// Block native form navigation if later script setup fails.
analyzeForm?.addEventListener("submit", (event) => {
  event.preventDefault();
});

const LLM_SETTINGS_STORAGE_KEY = "gfont-localize-llm-settings";
const DEFAULT_LLM_SETTINGS = {
  enabled: false,
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o-mini",
};

/** @type {{ variants: any[], families: string[], defaultSelectedVariantIds: string[], discoveredFontCssUrls: string[] } | null} */
let analysisState = null;

/** @type {Set<string>} */
let selectedIds = new Set();

/** @type {string} */
let previewFormat = "woff2";

/** @type {boolean} */
let showAllSubsets = false;

const SUBSET_SAMPLE_TEXT = {
  latin: "The quick brown fox jumps over the lazy dog.",
  "latin-ext": "Voix ambiguë d’un cœur qui au zéphyr préfère les jattes de kiwis.",
  cyrillic: "Съешь же ещё этих мягких французских булок.",
  "cyrillic-ext": "Алаш ах дунёниң улы бичим даласын.",
  greek: "Ξεσκεδάζω τὴν φλογοφόρο βουλή.",
  "greek-ext": "Ὃ ἦν πᾶν καὶ χωρὶς αὐτοῦ ἐγένετο οὐδὲ ἕν.",
  vietnamese: "Tôi yêu tiếng Việt và những chiếc bánh mì.",
  hebrew: "דג סקרן שט בים מאוכזב ולפתע מצא חברה.",
  math: "∫∑∞ αβγ Δx ≈ π",
  symbols: "☀★♞☎✈♠♣♥♦",
};

const FORMAT_DECLARATIONS = {
  woff2: "format('woff2')",
  woff: "format('woff')",
  ttf: "format('truetype')",
};

const LICENSE_WARNING_MESSAGE =
  "Some detected fonts could not be verified as free/open-source.\n\nUsing paid, proprietary, or restricted fonts without a valid license may create legal or financial risk. Please confirm that you have the right to use these fonts before downloading or self-hosting them.";

function getSelectedFormats() {
  return [...document.querySelectorAll('input[name="format"]:checked')].map(
    (input) => /** @type {HTMLInputElement} */ (input).value
  );
}

/** @type {boolean} */
let pdfReportSupported = false;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

async function parseApiError(response, fallbackMessage) {
  try {
    const payload = await response.json();
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
    if (typeof payload.message === "string" && payload.message.length > 0) {
      return payload.message;
    }
  } catch {
    // ignore JSON parse errors
  }

  if (response.status === 404) {
    return `${fallbackMessage} Server endpoint not found — stop the old server and restart with: npm run build && npm run web`;
  }

  return `${fallbackMessage} (HTTP ${response.status})`;
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function filenameFromDisposition(response, fallback) {
  return response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? fallback;
}

async function checkServerFeatures() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return;
    const payload = await response.json();
    pdfReportSupported = payload.features?.pdfReport === true;
    if (reportBtn && !pdfReportSupported) {
      reportBtn.title = "Restart the server: npm run build && npm run web";
    }
  } catch {
    pdfReportSupported = false;
  }
}

function parseSubsets(value) {
  const subsets = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return subsets.length > 0 ? subsets : null;
}

function loadLlmSettings() {
  try {
    const raw = localStorage.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };
    return { ...DEFAULT_LLM_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

function saveLlmSettings(settings) {
  localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function readLlmSettingsFromForm() {
  return {
    enabled: /** @type {HTMLInputElement} */ (llmEnabledInput).checked,
    apiUrl: /** @type {HTMLInputElement} */ (llmApiUrlInput).value.trim(),
    apiKey: /** @type {HTMLInputElement} */ (llmApiKeyInput).value.trim(),
    model: /** @type {HTMLInputElement} */ (llmModelInput).value.trim() || DEFAULT_LLM_SETTINGS.model,
  };
}

function applyLlmSettingsToForm(settings) {
  /** @type {HTMLInputElement} */ (llmEnabledInput).checked = Boolean(settings.enabled);
  /** @type {HTMLInputElement} */ (llmApiUrlInput).value = settings.apiUrl ?? DEFAULT_LLM_SETTINGS.apiUrl;
  /** @type {HTMLInputElement} */ (llmApiKeyInput).value = settings.apiKey ?? "";
  /** @type {HTMLInputElement} */ (llmModelInput).value = settings.model ?? DEFAULT_LLM_SETTINGS.model;
}

function resolveLlmSettingsForAnalyze() {
  const form = readLlmSettingsFromForm();
  const saved = loadLlmSettings();
  const apiUrl = form.apiUrl || saved.apiUrl;
  let apiKey = form.apiKey;

  // Password fields can appear empty even when settings were saved earlier.
  if (!apiKey && saved.apiKey && saved.apiUrl === apiUrl) {
    apiKey = saved.apiKey;
  }

  return {
    enabled: form.enabled,
    apiUrl,
    apiKey,
    model: form.model || saved.model || DEFAULT_LLM_SETTINGS.model,
    savedApiUrl: saved.apiUrl,
  };
}

function getLlmSettingsForRequest() {
  const settings = resolveLlmSettingsForAnalyze();

  if (settings.enabled && settings.apiUrl && settings.apiKey) {
    saveLlmSettings({
      enabled: true,
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.model,
    });
  }

  if (!settings.enabled) {
    return { enableLlmAdvisor: false };
  }

  if (!settings.apiUrl || !settings.apiKey) {
    if (settings.apiUrl && settings.apiUrl !== settings.savedApiUrl) {
      setLlmSettingsStatus("API URL changed — re-enter your API key for the new provider, then analyze again.");
    }
    return { enableLlmAdvisor: true, llmAdvisor: { enabled: true, apiUrl: settings.apiUrl || undefined } };
  }

  return {
    enableLlmAdvisor: true,
    llmAdvisor: {
      enabled: true,
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.model || DEFAULT_LLM_SETTINGS.model,
    },
  };
}

function setLlmSettingsStatus(message) {
  if (llmSettingsStatus) {
    llmSettingsStatus.textContent = message;
  }
}

function saveLlmSettingsFromForm() {
  const settings = resolveLlmSettingsForAnalyze();

  if (settings.enabled && (!settings.apiUrl || !settings.apiKey)) {
    setLlmSettingsStatus("API URL and API key are required when AI research is enabled.");
    return false;
  }

  saveLlmSettings({
    enabled: settings.enabled,
    apiUrl: settings.apiUrl,
    apiKey: settings.apiKey,
    model: settings.model,
  });
  applyLlmSettingsToForm(loadLlmSettings());
  setLlmSettingsStatus("License AI settings saved in this browser.");
  return true;
}

function initLlmSettings() {
  applyLlmSettingsToForm(loadLlmSettings());
}

initLlmSettings();
checkServerFeatures();

function groupVariantsByFamily(variants) {
  /** @type {Map<string, any[]>} */
  const grouped = new Map();

  for (const variant of variants) {
    const list = grouped.get(variant.family) ?? [];
    list.push(variant);
    grouped.set(variant.family, list);
  }

  return grouped;
}

function formatVariantLabel(variant) {
  return `${variant.subset} · ${variant.weight} · ${variant.style}`;
}

function getFamilyLicense(family) {
  return analysisState?.familyLicenses?.find((license) => license.family === family) ?? null;
}

function renderLicenseBadge(license) {
  if (!license) return "";
  return `<span class="license-badge ${escapeHtml(license.status)}">${escapeHtml(license.statusLabel)}</span>`;
}

function renderConfidenceBadge(license) {
  if (!license?.confidence) return "";
  return `<span class="confidence-badge ${escapeHtml(license.confidence)}">${escapeHtml(license.confidence)} confidence</span>`;
}

function renderLicenseEvidence(license) {
  if (!license?.evidence?.length) return "";

  const items = license.evidence
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `<details class="license-evidence">
    <summary>Why?</summary>
    <ul>${items}</ul>
  </details>`;
}

function renderLlmResearchLabel(license) {
  if (!license) return "";

  const evidence = license.evidence ?? [];
  const apiHostLine = evidence.find((item) => item.startsWith("LLM API host:"));
  const apiHost = apiHostLine ? apiHostLine.replace("LLM API host:", "").trim() : "";

  if (license.llmConsulted) {
    const hostHint = apiHost ? ` via ${apiHost}` : "";
    if (license.detectionMethod === "llm_advisor") {
      return `<span class="llm-status consulted escalated">AI research: consulted${hostHint} — flagged restricted</span>`;
    }
    return `<span class="llm-status consulted inconclusive">AI research: consulted${hostHint} — inconclusive</span>`;
  }

  if (license.detectionMethod !== "fallback") {
    return `<span class="llm-status not-used">AI research: not used (automatic detection)</span>`;
  }

  if (evidence.some((item) => item.includes("AI research was not enabled for this analysis."))) {
    return `<span class="llm-status not-used">AI research: not enabled</span>`;
  }

  if (evidence.some((item) => item.includes("AI research was enabled but API URL or key is missing."))) {
    return `<span class="llm-status not-used">AI research: enabled but missing API URL or key</span>`;
  }

  if (evidence.some((item) => item.startsWith("LLM advisor:"))) {
    return `<span class="llm-status consulted inconclusive">AI research: enabled but request failed</span>`;
  }

  return `<span class="llm-status not-used">AI research: not enabled</span>`;
}

function formatAnalyzeStatus(payload) {
  const base = `Found ${payload.variants.length} selectable variant(s) across ${payload.families.length} family/families.`;
  const llmMeta = payload.llmResearch;

  if (!llmMeta?.requested) {
    return base;
  }

  if (llmMeta.active) {
    const providerLabel =
      llmMeta.provider === "gemini"
        ? "Google Gemini"
        : llmMeta.provider === "groq"
          ? "Groq"
          : "OpenAI-compatible API";
    const host = llmMeta.apiHost ? ` @ ${llmMeta.apiHost}` : "";
    const model = llmMeta.model ? ` (${llmMeta.model})` : "";
    const calls =
      typeof llmMeta.llmCallCount === "number" && llmMeta.llmCallCount > 0
        ? ` — ${llmMeta.llmCallCount} API call(s) made`
        : " — no fonts needed AI (automatic detection handled the rest)";
    return `${base} AI license research active: ${providerLabel}${host}${model}${calls}.`;
  }

  return `${base} AI research is enabled but missing API URL or key.`;
}

function renderLicenseMeta(license) {
  if (!license) return "";

  const parts = [
    `<p><strong>Source:</strong> ${escapeHtml(license.source)}</p>`,
    `<p><strong>License:</strong> ${escapeHtml(license.license)}</p>`,
    `<p><strong>Commercial use:</strong> ${escapeHtml(license.commercialUse)}</p>`,
    renderLlmResearchLabel(license),
  ];

  if (license.confidence) {
    parts.push(`<p><strong>Confidence:</strong> ${escapeHtml(license.confidence)}</p>`);
  }

  if (license.detectionMethod) {
    parts.push(`<p><strong>Detection:</strong> ${escapeHtml(license.detectionMethod)}</p>`);
  }

  if (license.aiAssisted) {
    parts.push(`<p class="ai-tag">AI-assisted — not legal advice</p>`);
  }

  if (license.notes) {
    parts.push(`<p>${escapeHtml(license.notes)}</p>`);
  }

  parts.push(renderLicenseEvidence(license));
  return parts.join("");
}

function getSelectedFamilyLicenses() {
  if (!analysisState?.familyLicenses) return [];
  const selectedFamilies = new Set(getSelectedVariants().map((variant) => variant.family));
  return analysisState.familyLicenses.filter((license) => selectedFamilies.has(license.family));
}

function hasSelectedUnverifiedLicenses() {
  return getSelectedFamilyLicenses().some(
    (license) => license.status === "unknown" || license.status === "restricted"
  );
}

function getVisibleVariants() {
  if (!analysisState) return [];

  if (
    showAllSubsets ||
    analysisState.inputType !== "website" ||
    !analysisState.recommendedSubsets?.length
  ) {
    return analysisState.variants;
  }

  const recommended = new Set(analysisState.recommendedSubsets);
  const filtered = analysisState.variants.filter((variant) => recommended.has(variant.subset));
  return filtered.length > 0 ? filtered : analysisState.variants;
}

function getHiddenVariantCount() {
  if (!analysisState?.variants) return 0;
  return analysisState.variants.length - getVisibleVariants().length;
}

function formatSubsetList(subsets) {
  return subsets.join(", ");
}

function getSelectedVariants() {
  if (!analysisState) return [];
  return analysisState.variants.filter((variant) => selectedIds.has(variant.id));
}

function getAvailablePreviewFormats() {
  const formats = new Set();
  for (const variant of getSelectedVariants()) {
    for (const format of Object.keys(variant.sources)) {
      formats.add(format);
    }
  }
  return ["woff2", "woff", "ttf"].filter((format) => formats.has(format));
}

function buildPreviewFontId(variant, format) {
  return `preview-${variant.id.replace(/[^a-zA-Z0-9]+/g, "-")}-${format}`;
}

function escapeCssString(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPreviewSampleText(variant) {
  return SUBSET_SAMPLE_TEXT[variant.subset] ?? "The quick brown fox jumps over the lazy dog.";
}

function estimateFileCount() {
  const formats = getSelectedFormats();
  const unique = new Set();

  for (const variant of getSelectedVariants()) {
    for (const format of formats) {
      if (variant.sources[format]) {
        unique.add(`${variant.id}:${format}`);
      }
    }
  }

  return unique.size;
}

function renderDiscovery(result) {
  const parts = [];

  if (result.inputType === "website") {
    parts.push(`<p class="muted">Scanned <strong>${result.inputUrl}</strong></p>`);
  }

  if (result.discoveredFontCssUrls.length > 0) {
    parts.push(
      `<p><strong>${result.discoveredFontCssUrls.length}</strong> Google Fonts stylesheet(s) found:</p>`,
      `<ul class="discovery-list">${result.discoveredFontCssUrls
        .map((url) => `<li>${url}</li>`)
        .join("")}</ul>`
    );
  } else {
    parts.push(
      `<div class="empty">No Google Fonts CSS links were found. The site may use local fonts, system fonts, or JavaScript-injected fonts.</div>`
    );
  }

  if (result.inputType === "website" && result.pageLang && result.recommendedSubsets?.length) {
    parts.push(
      `<div class="info">Page language is <strong>${escapeHtml(result.pageLang)}</strong>. Showing recommended subsets (${escapeHtml(formatSubsetList(result.recommendedSubsets))}) by default. Extra subsets like greek or cyrillic come from Google Fonts returning all scripts when the stylesheet URL has no subset filter — not from the map or other page widgets.</div>`
    );
  }

  if (result.ignoredDirectFontAssetCount > 0) {
    parts.push(
      `<div class="warning">Ignored ${result.ignoredDirectFontAssetCount} direct Google Fonts binary URL(s) from gstatic (maps/widgets/preloads).</div>`
    );
  }

  if (result.familyLicenses?.length) {
    parts.push(`<div class="license-list">${result.familyLicenses
      .map((license) => {
        return `<div class="license-item">
          <div class="license-item-header">
            <strong>${escapeHtml(license.family)}</strong>
            <div class="license-badges">
              ${renderLicenseBadge(license)}
              ${renderConfidenceBadge(license)}
            </div>
          </div>
          ${renderLicenseMeta(license)}
        </div>`;
      })
      .join("")}</div>`);
  }

  if (result.hasUnverifiedLicenses) {
    parts.push(`<div class="warning">${escapeHtml(LICENSE_WARNING_MESSAGE)}</div>`);
  }

  discoveryContent.innerHTML = parts.join("");
  discoveryCard.classList.remove("hidden");
}

function syncSubsetControls() {
  const hiddenCount = getHiddenVariantCount();

  if (!toggleSubsetsBtn) return;

  if (analysisState?.inputType === "website" && analysisState.recommendedSubsets?.length) {
    toggleSubsetsBtn.classList.remove("hidden");
    toggleSubsetsBtn.textContent = showAllSubsets
      ? "Show recommended only"
      : `Show all subsets (${hiddenCount} hidden)`;
  } else {
    toggleSubsetsBtn.classList.add("hidden");
  }

  if (selectRecommendedBtn) {
    if (analysisState?.recommendedSubsets?.length) {
      selectRecommendedBtn.classList.remove("hidden");
    } else {
      selectRecommendedBtn.classList.add("hidden");
    }
  }
}

function renderSelection() {
  if (!analysisState) return;

  syncSubsetControls();
  const grouped = groupVariantsByFamily(getVisibleVariants());
  familiesContainer.innerHTML = "";

  for (const [family, variants] of grouped.entries()) {
    const block = document.createElement("section");
    block.className = "family-block";

    const header = document.createElement("div");
    header.className = "family-header";
    const license = getFamilyLicense(family);
    header.innerHTML = `
      <h3>${escapeHtml(family)}</h3>
      <div class="family-license">
        <div class="license-badges">
          ${license ? renderLicenseBadge(license) : ""}
          ${license ? renderConfidenceBadge(license) : ""}
        </div>
        ${license ? renderLlmResearchLabel(license) : ""}
        <span class="muted">${variants.length} variant(s)</span>
        ${license ? `<span class="license-detail">${escapeHtml(license.license)}</span>` : ""}
        ${license?.aiAssisted ? `<span class="ai-tag">AI-assisted</span>` : ""}
      </div>
    `;
    block.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "variant-grid";

    for (const variant of variants) {
      const label = document.createElement("label");
      const isSelected = selectedIds.has(variant.id);
      label.className = `variant-item${isSelected ? " is-selected" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isSelected;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedIds.add(variant.id);
        } else {
          selectedIds.delete(variant.id);
        }
        label.classList.toggle("is-selected", checkbox.checked);
        syncPreviewControls();
        renderPreview();
        renderExportSummary();
      });

      const meta = document.createElement("div");
      meta.className = "variant-meta";
      meta.innerHTML = `<strong>${formatVariantLabel(variant)}</strong><span>${Object.keys(variant.sources).join(", ")}</span>`;

      label.appendChild(checkbox);
      label.appendChild(meta);
      grid.appendChild(label);
    }

    block.appendChild(grid);
    familiesContainer.appendChild(block);
  }

  selectionCard.classList.remove("hidden");
}

function syncPreviewControls() {
  const availableFormats = getAvailablePreviewFormats();

  previewFormatSelect.innerHTML = "";
  for (const format of availableFormats) {
    const option = document.createElement("option");
    option.value = format;
    option.textContent = format;
    previewFormatSelect.appendChild(option);
  }

  if (!availableFormats.includes(previewFormat)) {
    previewFormat = availableFormats[0] ?? "woff2";
  }
  previewFormatSelect.value = previewFormat;
  previewFormatSelect.disabled = availableFormats.length === 0;
}

function buildPreviewFaceRules(format) {
  const rules = [];

  for (const variant of getSelectedVariants()) {
    const srcUrl = variant.sources[format];
    if (!srcUrl) continue;

    const fontId = buildPreviewFontId(variant, format);
    rules.push(`@font-face {
  font-family: '${escapeCssString(fontId)}';
  src: url('${escapeCssString(srcUrl)}') ${FORMAT_DECLARATIONS[format]};
  font-style: ${variant.style};
  font-weight: ${variant.weight};
  font-display: swap;
}`);
  }

  return rules;
}

function renderPreview() {
  syncPreviewControls();
  previewContainer.innerHTML = "";

  const selected = getSelectedVariants();
  previewCountEl.textContent =
    selected.length === 0
      ? ""
      : `${selected.length} variant(s) selected for preview and download`;

  if (selected.length === 0) {
    previewContainer.innerHTML = `<div class="empty">Check one or more variants above to preview them here before download.</div>`;
    previewCard.classList.remove("hidden");
    return;
  }

  const availableFormats = getAvailablePreviewFormats();
  if (!availableFormats.includes(previewFormat)) {
    previewContainer.innerHTML = `<div class="empty">No preview available for the selected format.</div>`;
    previewCard.classList.remove("hidden");
    return;
  }

  const previewable = selected.filter((variant) => variant.sources[previewFormat]);
  const faceRules = buildPreviewFaceRules(previewFormat);

  if (previewable.length === 0) {
    previewContainer.innerHTML = `<div class="empty">None of the selected variants include the ${previewFormat} format. Try another preview format.</div>`;
    previewCard.classList.remove("hidden");
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.textContent = faceRules.join("\n");
  previewContainer.appendChild(styleEl);

  for (const variant of previewable) {
    const fontId = buildPreviewFontId(variant, previewFormat);
    const item = document.createElement("div");
    item.className = "preview-item";
    item.innerHTML = `
      <span class="preview-label">${escapeHtml(variant.family)}</span>
      <span class="preview-meta">${escapeHtml(formatVariantLabel(variant))} · ${escapeHtml(previewFormat)}</span>
      <p class="preview-sample" style="font-family: '${escapeCssString(fontId)}', sans-serif; font-weight: ${variant.weight}; font-style: ${variant.style};">
        ${escapeHtml(getPreviewSampleText(variant))}
      </p>
    `;
    previewContainer.appendChild(item);
  }

  previewCard.classList.remove("hidden");
}

function buildInstallContext() {
  if (!analysisState) return null;
  return {
    inputUrl: analysisState.inputUrl,
    inputType: analysisState.inputType,
    discoveredFontCssUrls: analysisState.discoveredFontCssUrls ?? [],
  };
}

function buildReportPayload() {
  if (!analysisState) return null;
  return {
    inputUrl: analysisState.inputUrl,
    inputType: analysisState.inputType,
    discoveredFontCssUrls: analysisState.discoveredFontCssUrls ?? [],
    ignoredDirectFontAssetCount: analysisState.ignoredDirectFontAssetCount ?? 0,
    scannedStylesheets: analysisState.scannedStylesheets,
    pageLang: analysisState.pageLang,
    recommendedSubsets: analysisState.recommendedSubsets,
    variants: analysisState.variants,
    selectedVariantIds: [...selectedIds],
    familyLicenses: analysisState.familyLicenses ?? [],
    llmResearch: analysisState.llmResearch,
    formats: getSelectedFormats(),
  };
}

function renderInstallInstructions() {
  if (!installInstructions || !installSteps) return;

  if (!analysisState || getSelectedVariants().length === 0) {
    installInstructions.classList.add("hidden");
    return;
  }

  const steps = [
    "Download the ZIP and extract it into your project (e.g. public/fonts-bundle/).",
    "Upload fonts.css and the fonts/ folder so they are publicly reachable on your server.",
    'Add <link rel="stylesheet" href="./fonts.css"> to your HTML <head> (adjust the path if needed).',
  ];

  if (analysisState.inputType === "website" && analysisState.discoveredFontCssUrls?.length) {
    steps.push("Remove the existing Google Fonts <link> tags listed below from your site.");
  }

  steps.push(
    "Open test.html via your local server to verify every selected variant loads.",
    "In DevTools → Network, confirm font requests go to your domain, not fonts.gstatic.com."
  );

  installSteps.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  installInstructions.classList.remove("hidden");

  const removeUrls = analysisState.discoveredFontCssUrls ?? [];
  if (installLinksToRemove && installRemoveList) {
    if (analysisState.inputType === "website" && removeUrls.length > 0) {
      installRemoveList.innerHTML = removeUrls
        .map((url) => `<li><code>${escapeHtml(url)}</code></li>`)
        .join("");
      installLinksToRemove.classList.remove("hidden");
    } else {
      installRemoveList.innerHTML = "";
      installLinksToRemove.classList.add("hidden");
    }
  }
}

function renderExportSummary() {
  const selectedCount = getSelectedVariants().length;
  const fileCount = estimateFileCount();
  exportSummary.textContent =
    selectedCount === 0
      ? "No variants selected — ZIP download disabled. You can still download a PDF report."
      : `${selectedCount} variant(s) selected · about ${fileCount} font file(s) in ZIP · INSTALL.md + LICENSE-SUMMARY.txt included`;

  if (licenseWarningEl) {
    if (hasSelectedUnverifiedLicenses()) {
      licenseWarningEl.textContent = LICENSE_WARNING_MESSAGE;
      licenseWarningEl.classList.remove("hidden");
    } else {
      licenseWarningEl.textContent = "";
      licenseWarningEl.classList.add("hidden");
    }
  }

  exportBtn.disabled = selectedCount === 0;
  if (reportBtn) {
    reportBtn.disabled = !analysisState;
  }
  renderInstallInstructions();
  exportCard.classList.remove("hidden");
}

function selectAll() {
  if (!analysisState) return;
  selectedIds = new Set(analysisState.variants.map((variant) => variant.id));
  renderSelection();
  renderPreview();
  renderExportSummary();
}

function selectRecommendedOnly() {
  if (!analysisState?.recommendedSubsets?.length) return;
  const recommended = new Set(analysisState.recommendedSubsets);
  selectedIds = new Set(
    analysisState.variants.filter((variant) => recommended.has(variant.subset)).map((v) => v.id)
  );
  renderSelection();
  renderPreview();
  renderExportSummary();
}

function selectLatinOnly() {
  if (!analysisState) return;
  const latin = analysisState.variants.filter((variant) => variant.subset === "latin");
  selectedIds = new Set((latin.length > 0 ? latin : analysisState.variants).map((v) => v.id));
  renderSelection();
  renderPreview();
  renderExportSummary();
}

function clearSelection() {
  selectedIds = new Set();
  renderSelection();
  renderPreview();
  renderExportSummary();
}

previewFormatSelect.addEventListener("change", () => {
  previewFormat = previewFormatSelect.value;
  renderPreview();
});

analyzeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formats = getSelectedFormats();
  if (formats.length === 0) {
    setStatus("Select at least one format (woff2, woff, or ttf).", "error");
    return;
  }

  setStatus("Analyzing...", "");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: inputUrl.value.trim(),
        formats,
        subsets: parseSubsets(inputSubsets.value),
        ...getLlmSettingsForRequest(),
      }),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Server returned an invalid response. Is the web server running (npm run web)?");
    }

    if (!response.ok) {
      throw new Error(payload.error || "Analysis failed.");
    }

    analysisState = payload;
    showAllSubsets = false;
    const defaultIds =
      Array.isArray(payload.defaultSelectedVariantIds) && payload.defaultSelectedVariantIds.length > 0
        ? payload.defaultSelectedVariantIds
        : payload.variants.map((v) => v.id);
    selectedIds = new Set(defaultIds);
    previewFormat = "woff2";

    renderDiscovery(payload);

    if (!Array.isArray(payload.variants) || payload.variants.length === 0) {
      selectionCard.classList.add("hidden");
      previewCard.classList.add("hidden");
      renderExportSummary();

      const subsetHint = parseSubsets(inputSubsets.value)
        ? " The subset filter may be excluding all variants — try clearing it."
        : payload.discoveredFontCssUrls?.length
          ? " Google Fonts CSS was found but no downloadable variants matched your format/subset settings."
          : "";

      setStatus(`No selectable Google Fonts variants found.${subsetHint}`, "error");
      return;
    }

    renderSelection();
    renderPreview();
    renderExportSummary();
    setStatus(formatAnalyzeStatus(payload), payload.llmResearch?.requested && !payload.llmResearch?.active ? "error" : "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
});

exportBtn.addEventListener("click", async () => {
  if (!analysisState || selectedIds.size === 0) return;

  const needsLicenseAcknowledgment = hasSelectedUnverifiedLicenses();
  if (needsLicenseAcknowledgment) {
    const confirmed = window.confirm(
      `${LICENSE_WARNING_MESSAGE}\n\nDo you confirm that you have the right to download and self-host these fonts?`
    );
    if (!confirmed) {
      setStatus("Download cancelled. Confirm font licensing before exporting.", "error");
      return;
    }
  }

  exportBtn.disabled = true;
  setStatus("Building ZIP...", "");

  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variants: analysisState.variants,
        selectedVariantIds: [...selectedIds],
        formats: getSelectedFormats(),
        fontDisplay: null,
        prefix: "./fonts/",
        familyLicenses: analysisState.familyLicenses ?? [],
        acknowledgeLicenseRisk: needsLicenseAcknowledgment,
        installContext: buildInstallContext(),
        reportContext: buildReportPayload(),
      }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response, "Export failed."));
    }

    const blob = await response.blob();
    downloadBlob(blob, filenameFromDisposition(response, "fonts-localized.zip"));

    setStatus("ZIP downloaded successfully.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    exportBtn.disabled = selectedIds.size === 0;
  }
});

reportBtn?.addEventListener("click", async () => {
  if (!analysisState) {
    setStatus("Analyze a website first, then download the PDF report.", "error");
    return;
  }

  if (!pdfReportSupported) {
    setStatus(
      "PDF report is unavailable on this server. Stop the old server and restart with: npm run build && npm run web",
      "error"
    );
    return;
  }

  const payload = buildReportPayload();
  if (!payload) {
    setStatus("Could not build report data. Analyze the site again.", "error");
    return;
  }

  reportBtn.disabled = true;
  setStatus("Creating PDF report...", "");

  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response, "PDF report creation failed."));
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.includes("application/pdf")) {
      throw new Error("Server did not return a PDF. Restart the server with: npm run build && npm run web");
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error("Server returned an empty PDF file.");
    }

    downloadBlob(blob, filenameFromDisposition(response, "website-font-report.pdf"));
    setStatus("PDF report downloaded.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    reportBtn.disabled = !analysisState;
  }
});

selectAllBtn.addEventListener("click", selectAll);
selectLatinBtn.addEventListener("click", selectLatinOnly);
selectRecommendedBtn?.addEventListener("click", selectRecommendedOnly);
toggleSubsetsBtn?.addEventListener("click", () => {
  showAllSubsets = !showAllSubsets;
  renderSelection();
});
clearBtn.addEventListener("click", clearSelection);

llmSaveBtn?.addEventListener("click", () => {
  saveLlmSettingsFromForm();
});

llmClearBtn?.addEventListener("click", () => {
  const settings = { ...DEFAULT_LLM_SETTINGS };
  saveLlmSettings(settings);
  applyLlmSettingsToForm(settings);
  setLlmSettingsStatus("Saved API key cleared from this browser.");
});
