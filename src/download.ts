import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFontFilename } from "./filename.js";
import type { FontFormat, LocalFontFile, MergedFontVariant } from "./types.js";

const FORMAT_EXTENSIONS: Record<FontFormat, string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "ttf",
};

export class FontDownloadError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "FontDownloadError";
  }
}

async function downloadBinary(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new FontDownloadError(
      `Failed to download font: HTTP ${response.status} ${response.statusText}`,
      url,
      response.status
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;

  async function runWorker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
}

interface DownloadTask {
  variant: MergedFontVariant;
  format: FontFormat;
  remoteUrl: string;
  filename: string;
  absolutePath: string;
}

function buildFilenameForVariant(
  variant: MergedFontVariant,
  format: FontFormat
): string {
  const extension = FORMAT_EXTENSIONS[format];

  if (format === "woff" || format === "ttf") {
    return buildFontFilename({ ...variant, subset: "unknown" }, extension);
  }

  return buildFontFilename(variant, extension);
}

export async function downloadFontFiles(
  variants: MergedFontVariant[],
  outDir: string,
  formats: FontFormat[],
  concurrency = 5
): Promise<{ files: LocalFontFile[]; urlToFilename: Map<string, string> }> {
  await mkdir(outDir, { recursive: true });

  const tasks: DownloadTask[] = [];
  const pathsByRemoteUrl = new Map<string, Set<string>>();
  const urlToFilename = new Map<string, string>();

  for (const variant of variants) {
    for (const format of formats) {
      const remoteUrl = variant.sources[format];
      if (!remoteUrl) {
        continue;
      }

      const filename = buildFilenameForVariant(variant, format);
      const absolutePath = path.join(outDir, filename);

      if (!urlToFilename.has(remoteUrl)) {
        urlToFilename.set(remoteUrl, filename);
      }

      const paths = pathsByRemoteUrl.get(remoteUrl) ?? new Set<string>();
      paths.add(absolutePath);
      pathsByRemoteUrl.set(remoteUrl, paths);

      tasks.push({
        variant,
        format,
        remoteUrl,
        filename: urlToFilename.get(remoteUrl)!,
        absolutePath,
      });
    }
  }

  const uniqueUrls = Array.from(pathsByRemoteUrl.keys());

  await runWithConcurrency(uniqueUrls, concurrency, async (remoteUrl) => {
    const buffer = await downloadBinary(remoteUrl);
    const targetPaths = pathsByRemoteUrl.get(remoteUrl) ?? new Set<string>();

    await Promise.all(
      Array.from(targetPaths).map(async (targetPath) => {
        await writeFile(targetPath, buffer);
      })
    );
  });

  const localFiles: LocalFontFile[] = [];

  for (const variant of variants) {
    for (const format of formats) {
      const remoteUrl = variant.sources[format];
      if (!remoteUrl) {
        continue;
      }

      const filename = urlToFilename.get(remoteUrl)!;

      localFiles.push({
        variant,
        format,
        remoteUrl,
        localPath: path.join(outDir, filename),
        filename,
      });
    }
  }

  return { files: localFiles, urlToFilename };
}

export function buildUrlToFilenameMap(
  variants: MergedFontVariant[],
  formats: FontFormat[]
): Map<string, string> {
  const urlToFilename = new Map<string, string>();

  for (const variant of variants) {
    for (const format of formats) {
      const remoteUrl = variant.sources[format];
      if (!remoteUrl || urlToFilename.has(remoteUrl)) {
        continue;
      }

      urlToFilename.set(remoteUrl, buildFilenameForVariant(variant, format));
    }
  }

  return urlToFilename;
}

export async function downloadFontFilesToMemory(
  variants: MergedFontVariant[],
  formats: FontFormat[],
  concurrency = 5
): Promise<{ files: Map<string, Buffer>; urlToFilename: Map<string, string> }> {
  const urlToFilename = buildUrlToFilenameMap(variants, formats);
  const uniqueUrls = Array.from(urlToFilename.keys());
  const files = new Map<string, Buffer>();

  await runWithConcurrency(uniqueUrls, concurrency, async (remoteUrl) => {
    const buffer = await downloadBinary(remoteUrl);
    const filename = urlToFilename.get(remoteUrl)!;
    files.set(filename, buffer);
  });

  return { files, urlToFilename };
}
