# Maintaining the collection

The repository is a GitHub-native visual directory. The home page is a category overview; each category has a three-column gallery and an expandable text view.

## Source files

- `data/project.json` — project title, repository/folder name, tagline, GitHub description and topics, and allowed format/language labels.
- `data/links.json` — English titles, descriptions, format labels, source languages and saved URLs.
- `data/categories.json` — category names, descriptions and preferred cover images.
- `data/link-status.json` — automated HTTP checks and the last successful date.
- `data/previews.json` — screenshot outcomes, capture dates and source addresses.
- `assets/previews/` — small JPEG screenshots; browser capture diagnostics are kept locally under ignored `output/playwright/`.

The README, category pages, text index and status badges are generated. Edit the source JSON, then rebuild.

## Repository identity

Use **Awesome Maps & Visualizations** as the display title and `awesome-maps-and-visualizations` as the repository name. The local folder can keep its current name. The description, tagline and twelve GitHub Topics are stored in `data/project.json`. Package keywords mirror the topics.

When publishing, copy the description and topics into the repository's GitHub About settings. Local metadata does not change GitHub settings automatically. Do not put a second tag cloud in the README: categories, format labels and source languages provide the browsing structure.

## Licensing

[LICENSE.md](LICENSE.md) defines the scope: original catalogue content and documentation use CC BY 4.0; original code and SVG assets use MIT. Full license texts are in `LICENSES/`. Third-party screenshots and linked works are excluded; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Keep the licensing section in `scripts/build-catalog.mjs`, not only in the generated README. Preserve screenshot provenance in `data/previews.json`. The repository license is not a substitute for checking the rights to publish third-party previews.

## Build

Requires Node.js 20 or later.

```powershell
npm run build
```

No package installation is needed for this command. The old `scripts/import_bookmarks.ps1` command remains a compatibility wrapper.

## Refresh availability

Requires PowerShell 7 and Node.js.

```powershell
npm run check-links
```

The checker preserves the last successful date until a newer successful check replaces it. Cards show only **Last available: YYYY-MM-DD**, without error explanations. Entries without a successful check show **Not verified yet**. It checks only URLs currently in the collection and rebuilds all pages. The GitHub workflow runs once a month, on the first day at 03:17 UTC, and commits updated dates, generated badges and pages. Scheduled runs start after publication to the repository's default branch; the workflow can also be run manually.

## Capture previews

```powershell
npm ci
npm run capture
npm run build
```

Capture uses a separate, unsigned-in Chrome context. Install Google Chrome, or run `npx playwright install chromium` and set `PREVIEW_BROWSER=chromium`. Three pages are processed at a time. Each 1280 × 800 browser viewport becomes a compact 640 × 400 JPEG.

Retry failed checks and unavailable captures with `npm run capture -- --retry --slow`, or select entries with `npm run capture -- --only ancient-earth,day-in-america`. Slow mode uses two pages at a time, longer navigation timeouts and an additional rendering wait. Inspect captured images before publishing: cookies, loading screens and unsupported graphics can still produce an unhelpful image.

Unavailable or blocked sites get a labeled placeholder, not a fabricated screenshot. A failed refresh preserves a previously saved preview and its original capture date. The capture script also updates availability from the browser's main-page HTTP response. A screenshot failure by itself does not make a successfully responding site offline. A successful HTTP response does not guarantee that map tiles or other interactive content rendered correctly.

## Local preview

```powershell
npm ci
npm run preview
```

Open `http://127.0.0.1:4173`. This uses a GitHub-style Markdown stylesheet for local inspection. GitHub may apply additional sanitization or layout rules. The gallery table can scroll horizontally on narrow screens; every category also offers an expandable text view.

## Editorial decisions

Static historical maps, visual essays and non-geographic visualizations are welcome. A new review decision must explicitly authorize removing an existing entry. Prefer the entry page of a service or project over personal coordinates, dates, camera settings or filters; retain path segments and parameters that identify the actual project or language. Keep one entry per service unless separate works are intentionally curated.

Cards center the preview, linked title, format and language label; descriptions stay left-aligned. Language cues use local SVG assets in `assets/languages/`: Russian and UK flags for RU and EN, a globe for Multilingual, and no national flag for Latin. The written language label must remain visible.
