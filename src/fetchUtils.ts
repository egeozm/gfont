export function formatFetchError(url: string, error: unknown): string {
  if (!(error instanceof Error)) {
    return `Failed to fetch ${url}.`;
  }

  const cause = error.cause as (Error & { code?: string }) | undefined;

  if (cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
    return `Connection timed out while fetching ${url}. The site may be down, slow, blocking automated requests, or unreachable from your network.`;
  }

  if (cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN") {
    return `Could not resolve hostname for ${url}. Check the URL spelling and your internet connection.`;
  }

  if (cause?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || cause?.code === "CERT_HAS_EXPIRED") {
    return `SSL certificate error while fetching ${url}.`;
  }

  if (cause?.message) {
    return `Failed to fetch ${url}: ${cause.message}`;
  }

  if (error.message && error.message !== "fetch failed") {
    return `Failed to fetch ${url}: ${error.message}`;
  }

  return `Failed to fetch ${url}. The site may be down or blocking automated requests.`;
}

export async function fetchTextWithTimeout(
  url: string,
  options: {
    accept?: string;
    timeoutMs?: number;
    userAgent?: string;
  } = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: options.accept ?? "text/html,text/css,*/*;q=0.1",
        "User-Agent":
          options.userAgent ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(formatFetchError(url, { cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: error.message } }));
    }

    if (error instanceof Error && error.message.startsWith("HTTP ")) {
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }

    throw new Error(formatFetchError(url, error));
  }
}
