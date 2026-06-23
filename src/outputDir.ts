import { access } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./filename.js";

export function buildOutputFolderName(families: string[]): string {
  if (families.length === 0) {
    return "fonts";
  }

  return families.map((family) => slugify(family)).filter(Boolean).join("-") || "fonts";
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveOutputDir(baseDir: string, families: string[]): Promise<{
  outDir: string;
  folderName: string;
}> {
  const folderName = buildOutputFolderName(families);
  let candidate = path.resolve(baseDir, folderName);

  if (!(await directoryExists(candidate))) {
    return { outDir: candidate, folderName };
  }

  let suffix = 2;
  while (await directoryExists(`${candidate}-${suffix}`)) {
    suffix += 1;
  }

  const uniqueFolderName = `${folderName}-${suffix}`;
  candidate = path.resolve(baseDir, uniqueFolderName);

  return { outDir: candidate, folderName: uniqueFolderName };
}
