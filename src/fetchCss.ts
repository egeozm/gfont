import type { FontFormat } from "./types.js";

export const USER_AGENTS: Record<FontFormat, string> = {
  woff2:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  woff:
    "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
  ttf:
    "Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.1.0.346 Mobile Safari/534.11+",
};

export class CssFetchError extends Error {
  constructor(
    message: string,
    public readonly format: FontFormat,
    public readonly status?: number
  ) {
    super(message);
    this.name = "CssFetchError";
  }
}

export async function fetchCssForFormat(url: string, format: FontFormat): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENTS[format],
      Accept: "text/css,*/*;q=0.1",
    },
  });

  if (!response.ok) {
    throw new CssFetchError(
      `Failed to fetch CSS for ${format}: HTTP ${response.status} ${response.statusText}`,
      format,
      response.status
    );
  }

  return response.text();
}

export async function fetchCssForFormats(
  url: string,
  formats: FontFormat[]
): Promise<Map<FontFormat, string>> {
  const results = await Promise.all(
    formats.map(async (format) => {
      const css = await fetchCssForFormat(url, format);
      return [format, css] as const;
    })
  );

  return new Map(results);
}
