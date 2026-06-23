import type { MergedFontVariant } from "./types.js";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function buildFontFilename(
  variant: Pick<MergedFontVariant, "family" | "subset" | "weight" | "style">,
  extension: string
): string {
  const familySlug = slugify(variant.family) || "font";
  const subsetSlug = slugify(variant.subset) || "unknown";
  const styleSlug = variant.style === "italic" ? "italic" : "normal";

  return `${familySlug}-${subsetSlug}-${variant.weight}-${styleSlug}.${extension}`;
}
