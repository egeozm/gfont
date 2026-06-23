export type FontFormat = "woff2" | "woff" | "ttf";

export interface ParsedGoogleFontsUrl {
  url: string;
  families: string[];
  requestedSubsets: string[] | null;
}

export interface FontVariant {
  family: string;
  style: "normal" | "italic";
  weight: number;
  subset: string;
  fontDisplay: string | null;
  unicodeRange: string | null;
  format: FontFormat;
  srcUrl: string;
}

export interface MergedFontVariant {
  family: string;
  style: "normal" | "italic";
  weight: number;
  subset: string;
  fontDisplay: string | null;
  unicodeRange: string | null;
  sources: Partial<Record<FontFormat, string>>;
}

export interface LocalFontFile {
  variant: MergedFontVariant;
  format: FontFormat;
  remoteUrl: string;
  localPath: string;
  filename: string;
}

export interface LocalizeOptions {
  url: string;
  baseDir: string;
  cssPath: string | null;
  formats: FontFormat[];
  subsets: string[] | null;
  prefix: string;
  fontDisplay: string | null;
}

export interface LocalizeResult {
  cssPath: string;
  outDir: string;
  folderName: string;
  testHtmlPath: string;
  families: string[];
  files: LocalFontFile[];
  variantCount: number;
}

export interface DiscoveredFontLink {
  url: string;
  sourcePageUrl: string;
}

export interface WebsiteDiscoveryResult {
  pageUrl: string;
  pageLang: string | null;
  recommendedSubsets: string[];
  fontLinks: DiscoveredFontLink[];
  scannedStylesheets: string[];
  ignoredDirectFontAssetCount: number;
  selfHostedFonts: SelfHostedFontAsset[];
}

export interface LocalizeManyOptions {
  websiteUrl: string;
  baseDir: string;
  cssPath: string | null;
  formats: FontFormat[];
  subsets: string[] | null;
  prefix: string;
  fontDisplay: string | null;
}

export interface LocalizeSharedOptions {
  baseDir: string;
  cssPath: string | null;
  formats: FontFormat[];
  subsets: string[] | null;
  prefix: string;
  fontDisplay: string | null;
}

export interface LocalizeManyResult {
  websiteUrl: string;
  discovery: WebsiteDiscoveryResult;
  results: LocalizeResult[];
}

export interface SelectableFontVariant {
  id: string;
  family: string;
  style: "normal" | "italic";
  weight: number;
  subset: string;
  fontDisplay: string | null;
  unicodeRange: string | null;
  sources: Partial<Record<FontFormat, string>>;
  sourceCssUrl: string;
}

export type FontLicenseStatus = "free" | "unknown" | "restricted";

export type FontLicenseConfidence = "high" | "medium" | "low";

export interface FontLicenseInfo {
  family: string;
  source: string;
  license: string;
  commercialUse: string;
  status: FontLicenseStatus;
  statusLabel: string;
  confidence: FontLicenseConfidence;
  evidence?: string[];
  detectionMethod?: string;
  aiAssisted?: boolean;
  llmConsulted?: boolean;
  notes?: string;
}

export interface LlmAdvisorConfig {
  enabled?: boolean;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface LicenseResolutionOptions {
  enableLlmAdvisor?: boolean;
  llmAdvisorRequested?: boolean;
  llmAdvisor?: LlmAdvisorConfig;
}

export interface FontMetadataExtraction {
  licenseStrings: string[];
  copyright?: string;
  manufacturer?: string;
  designer?: string;
  vendorId?: string;
  fontFullName?: string;
  fontFamily?: string;
}

export interface SelfHostedFontAsset {
  family: string;
  sourceUrl: string;
  sampleUrl: string;
}

export interface AnalyzeInputOptions {
  url: string;
  formats: FontFormat[];
  subsets: string[] | null;
  enableLlmAdvisor?: boolean;
  llmAdvisor?: LlmAdvisorConfig;
}

export interface LlmResearchMeta {
  requested: boolean;
  active: boolean;
  provider?: "openai" | "gemini" | "groq";
  apiHost?: string;
  model?: string;
  llmCallCount?: number;
  reason?: "not_enabled" | "missing_config";
}

export interface AnalyzeResult {
  inputUrl: string;
  inputType: "googleFontsCss" | "website";
  discoveredFontCssUrls: string[];
  ignoredDirectFontAssetCount: number;
  scannedStylesheets?: string[];
  pageLang?: string | null;
  recommendedSubsets?: string[];
  variants: SelectableFontVariant[];
  families: string[];
  familyLicenses: FontLicenseInfo[];
  hasUnverifiedLicenses: boolean;
  llmResearch?: LlmResearchMeta;
}

export interface ExportInstallContext {
  inputUrl: string;
  inputType: AnalyzeResult["inputType"];
  discoveredFontCssUrls: string[];
}

export interface ExportSelectionRequest {
  variants: SelectableFontVariant[];
  selectedVariantIds: string[];
  formats: FontFormat[];
  fontDisplay: string | null;
  prefix?: string;
  zipName?: string;
  familyLicenses?: FontLicenseInfo[];
  acknowledgeLicenseRisk?: boolean;
  installContext?: ExportInstallContext;
  reportContext?: WebsiteReportInput;
}

export interface WebsiteReportInput {
  inputUrl: string;
  inputType: AnalyzeResult["inputType"];
  discoveredFontCssUrls: string[];
  ignoredDirectFontAssetCount: number;
  scannedStylesheets?: string[];
  pageLang?: string | null;
  recommendedSubsets?: string[];
  variants: SelectableFontVariant[];
  selectedVariantIds?: string[];
  familyLicenses: FontLicenseInfo[];
  llmResearch?: LlmResearchMeta;
  formats?: FontFormat[];
}

export interface WebsiteReportResult {
  filename: string;
  content: string;
}

export interface ExportSelectionResult {
  zipName: string;
  fileCount: number;
  variantCount: number;
  buffer: Buffer;
}
