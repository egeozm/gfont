import { create as createFont } from "fontkit";
import type { Font } from "fontkit";
import type { FontMetadataExtraction } from "./types.js";

const OPEN_SOURCE_LICENSE_MARKERS = [
  "sil open font license",
  "open font license",
  "apache license",
  "apache 2.0",
  "ubuntu font license",
  "ufl",
  " ofl",
  "ofl ",
  "creative commons",
  "public domain",
  "mit license",
  "gpl friendly",
];

const RESTRICTED_LICENSE_MARKERS = [
  "all rights reserved",
  "commercial license required",
  "not for redistribution",
  "proprietary",
  "trial version",
  "demo font",
  "personal use only",
  "font awesome pro",
  "adobe systems",
  "monotype",
  "fontshop",
  "typography.com",
  "myfonts",
  "fontspring",
  "fontsmith",
  "commercial type",
  "hoefler",
  "fonts.com",
];

function getNameRecord(font: Font, id: number): string | undefined {
  const record = font.name?.records?.[id];
  if (!record) return undefined;
  const value = typeof record === "string" ? record : record.en ?? Object.values(record)[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getVendorId(font: Font): string | undefined {
  const os2 = font["OS/2"] as { achVendID?: string } | undefined;
  const vendorId = os2?.achVendID?.trim();
  return vendorId && vendorId !== "    " ? vendorId : undefined;
}

export function extractFontMetadata(buffer: Buffer): FontMetadataExtraction | null {
  try {
    const font = createFont(buffer) as Font;
    const licenseStrings = [
      getNameRecord(font, 13),
      getNameRecord(font, 14),
      getNameRecord(font, 0),
    ].filter((value): value is string => Boolean(value));

    return {
      licenseStrings,
      copyright: getNameRecord(font, 0),
      manufacturer: getNameRecord(font, 8),
      designer: getNameRecord(font, 9),
      vendorId: getVendorId(font),
      fontFullName: getNameRecord(font, 4),
      fontFamily: getNameRecord(font, 1) ?? getNameRecord(font, 16),
    };
  } catch {
    return null;
  }
}

export function classifyEmbeddedLicenseText(text: string): "free" | "restricted" | "unknown" {
  const lower = text.toLowerCase();

  if (OPEN_SOURCE_LICENSE_MARKERS.some((marker) => lower.includes(marker))) {
    return "free";
  }

  if (RESTRICTED_LICENSE_MARKERS.some((marker) => lower.includes(marker))) {
    return "restricted";
  }

  return "unknown";
}

export function inspectEmbeddedFontLicense(buffer: Buffer): {
  status: "free" | "restricted" | "unknown";
  license: string;
  metadata: FontMetadataExtraction | null;
} {
  const metadata = extractFontMetadata(buffer);
  if (!metadata || metadata.licenseStrings.length === 0) {
    return { status: "unknown", license: "Unknown", metadata };
  }

  const combined = metadata.licenseStrings.join(" | ");
  const status = metadata.licenseStrings.reduce<"free" | "restricted" | "unknown">(
    (current, value) => {
      const next = classifyEmbeddedLicenseText(value);
      if (next === "restricted") return "restricted";
      if (next === "free" && current !== "restricted") return "free";
      return current;
    },
    "unknown"
  );

  return { status, license: combined, metadata };
}

/** @deprecated Use extractFontMetadata */
export function extractLicenseStringsFromFontBuffer(buffer: Buffer): string[] {
  return extractFontMetadata(buffer)?.licenseStrings ?? [];
}
