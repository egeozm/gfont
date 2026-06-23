# gfont-localize

CLI tool and local web app that automates self-hosting Google Fonts. Paste a Google Fonts CSS URL or a website page URL, select the font variants you want, and download local font files plus generated CSS.

## What it does

1. Accepts either a direct Google Fonts CSS URL or a website page URL
2. For websites, crawls same-origin pages by default (BFS, up to 50 pages) and scans HTML plus linked CSS for real `fonts.googleapis.com/css` links
3. Ignores unrelated direct `fonts.gstatic.com` binaries (maps, widgets, preloads)
4. Lets you choose families, weights, styles, subsets, and formats in a local web UI
5. Downloads selected font files and packages `fonts.css`, `test.html`, and font binaries into a ZIP

## Requirements

- Node.js 18+

## Install

```bash
npm install
npm run build
```

## Local Web UI

Start the local app:

```bash
npm run web
```

Open:

```text
http://127.0.0.1:3847
```

### Web UI flow

1. Paste a website URL or Google Fonts CSS URL
2. Click **Analyze fonts**
3. Review discovered font links and selectable variants
4. Choose the families/weights/subsets you want
5. Review **Install & download** steps and click **Download ZIP** or **Create website report**

ZIP contents:

```text
roboto-localized.zip
  fonts.css
  test.html
  INSTALL.md
  LICENSE-SUMMARY.txt
  WEBSITE-REPORT.pdf
  WEBSITE-REPORT.txt
  fonts/
    roboto-latin-400-normal.woff2
    roboto-unknown-400-normal.woff
    ...
```

The **Download PDF report** button downloads a formatted PDF with discovery details, per-font license analysis (matching the Discovery panel), AI research status, and evidence.

## CLI Usage

### Direct Google Fonts URL

```bash
gfont-localize "https://fonts.googleapis.com/css2?family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap"
```

### Website page URL

```bash
gfont-localize "https://example.com"
```

Each font CSS URL gets its own folder based on the font name(s) in the link.

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --out <dir>` | Base directory; a subfolder is created from the font name(s) | `./output` |
| `--css <path>` | Output CSS file path | `<folder>/fonts.css` |
| `--formats <list>` | Comma-separated formats: `woff2`, `woff`, `ttf` | `woff2,woff,ttf` |
| `--subsets <list>` | Subsets to include (e.g. `latin,latin-ext`) | all returned |
| `--prefix <str>` | URL prefix for generated `src` paths | `./` |
| `--font-display <val>` | Override `font-display` in generated CSS | from Google CSS |
| `--discovery <mode>` | Website discovery mode | `static` |
| `--no-crawl` | Scan only the given page (disable same-origin crawl) | crawl on |
| `--max-pages <n>` | Maximum same-origin pages to crawl | `50` |
| `--max-depth <n>` | Maximum link depth from seed page | `10` |
| `--list-font-links` | Print discovered Google Fonts CSS links without downloading | off |
| `--from-website` | Force website discovery mode | auto-detect |

## What gets ignored

The scanner only localizes Google Fonts **CSS API** URLs:

- `https://fonts.googleapis.com/css?...`
- `https://fonts.googleapis.com/css2?...`

It ignores direct binary font URLs such as:

- `https://fonts.gstatic.com/.../*.woff2`
- map/widget assets from `maps.gstatic.com` or `www.gstatic.com`

## Examples

```bash
# Web UI
npm run web

# Direct font URL
node dist/index.js "https://fonts.googleapis.com/css?family=Roboto|Varela+Round"

# Website page scan (crawls same-origin pages by default)
node dist/index.js "https://example.com"

# Single page only
node dist/index.js "https://example.com" --no-crawl

# Preview discovered links only
node dist/index.js "https://example.com" --list-font-links
```

## License detection

Each detected font is classified using a tiered, confidence-based pipeline:

1. Google Fonts metadata
2. Embedded font metadata (including woff2 via fontkit)
3. Foundry/vendor ID detection
4. Commercial font CDN/host detection
5. Known open-font name registry
6. Optional LLM advisor (escalate-only; never marks fonts as free)
7. Fallback to unknown with warning

ZIP exports include `LICENSE-SUMMARY.txt`, `INSTALL.md` (self-hosting steps), and optionally `WEBSITE-REPORT.txt` with status, confidence, evidence, and detection method.

### Optional LLM advisor

The LLM layer is **off by default**. It can only escalate fonts to `restricted` or leave them as `unknown`. It can never mark a font as free/safe.

**Web UI:** open **License AI settings**, enter your API URL and key, enable AI research, then analyze. Settings are picked up from the form automatically (Save is optional but keeps them for next time). Credentials stay in your browser's local storage and are sent only to the local server during analysis.

Supported APIs:

- **OpenAI-compatible** chat completions (OpenAI, local proxies, etc.)
- **Google Gemini** `generateContent` URLs, e.g. `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` (the API key is appended as `?key=` automatically)

**Environment variables** (alternative to the web UI):

| Variable | Description | Default |
|----------|-------------|---------|
| `LICENSE_LLM_ENABLED` | Enable LLM advisor (`true`/`1`) | off |
| `LICENSE_LLM_API_URL` | OpenAI chat completions or Gemini generateContent URL | — |
| `LICENSE_LLM_API_KEY` | API key | — |
| `LICENSE_LLM_MODEL` | Model name (OpenAI body; Gemini fallback if URL omits model) | `gpt-4o-mini` |
| `LICENSE_LLM_TIMEOUT_MS` | Request timeout in ms | `20000` |

Web UI settings override environment variables for each analyze request when enabled.

This tool provides informational license hints only. It is **not legal advice**.

## Limitations

- Static discovery only scans HTML and linked CSS. Fonts injected purely by JavaScript may not be found yet.
- Site crawl follows same-origin `<a href>` links only (default on, up to 50 pages / depth 10). Use `--no-crawl` or disable **Scan entire site** in the web UI for a single-page scan.
- Non-Google self-hosted fonts (for example SpaceX `D-DIN`) are out of scope.
- License labels include source references where available; they are informational hints only, not legal advice.

## License

MIT
