# SecondU interactive website

The website introduces SecondU through a full product workspace, interactive feature previews and bilingual product media. Feature previews open the mounted workspace over the current reading position and restore scroll and focus when closed. `product/embed.html` also opens the application independently.

Chinese/English and light/dark/system appearance are available. Visitors can explore the fictional examples, import a memory summary, review entries and edit a task draft. Example edits stay in page memory and reset on reload; website appearance preferences persist. Use the desktop app to work with personal records and connections.

## Local development

Install the root dependencies for shared product components, then the website dependencies:

```sh
npm ci --ignore-scripts
npm ci --prefix website --ignore-scripts
node website/build.mjs
```

The builder type-checks the website and shared imports, bundles React and Three.js, and writes `dist-site/` with the GitHub Pages base `/SecondU/`. It copies the listed public assets, fonts and licenses, and records output hashes in a build manifest.

To check the Pages base alongside an active root-mounted preview:

```sh
node website/build.mjs --check-pages
```

This writes to `.local/acceptance/website-pages-build/`. For a root-mounted local preview:

```sh
node website/build.mjs --base=/
python3 -m http.server 58710 --directory dist-site --bind 127.0.0.1
```

Rebuild with the default base before publishing to Pages. `site.json` defines the canonical, repository and release targets.

## Product components

- `src/EmbeddedProduct.tsx` hosts the desktop `App`; `src/embed/main.tsx` supports its independent page. Theme, language and preview navigation preserve the mounted frame and its drafts. The expanded dialog manages background interaction and restores its opener on close.
- `export-examples.mjs` creates the Chinese and English examples from the desktop initialization chain. The browser uses an in-memory API and isolated storage, with a fixed public-asset list in `embed-public-assets.json`.
- `src/FinanceStory.tsx` and `src/FinancePreview.tsx` present Overview, Portfolio, Structure, Allocation, Details and Holdings. The views combine asset history, spending, upcoming payments, investments, quotes and credit records. `finance-example.mjs` supplies shared bilingual records; the Finance browser API supports filtering, record inspection and calculations. Quote timestamps use `America/Los_Angeles`, while date-only records retain their original date. [Finance guide](../docs/FINANCE.md)
- `src/Capabilities.tsx` links feature stories to product routes. `src/DecisionSupport.tsx` opens a career discussion with an editable comparison outline, and `src/ExpertShowcase.tsx` reuses the desktop expert catalogue and badges.
- The browser memory adapter supports summary import, review, confirmation and draft editing, with original and revised entries retained during the session.
- `src/FuturePlayground.tsx` introduces the device, marketplace and Dating prototypes and the twelve-direction roadmap. `src/PrivacySection.tsx` explains local records and task context.
- `src/Development.tsx` and the application's build timeline read `docs/review.json`. The shared timeline supports buttons, keyboard navigation and touch scrolling.
- `src/UnderstandingSystem.tsx` embeds the bilingual understanding/action diagram with node inspection, tracing and zoom. `src/Benchmark.tsx` and the independent `benchmark/` page display saved benchmark results, comparisons and source records.

## Product media

`src/ProductPreview.tsx` displays product captures from `docs/readme-assets/`, with separate language and theme variants. Finance overview and portfolio images also appear in the README. `manifest.json` and `motion-manifest.json` record dimensions, source files and hashes. Reduced-motion preferences select static images, and off-screen previews pause.

The hero uses Three.js. Roadmap artwork and its source information are stored in `public/art/roadmap/`. Fonts, artwork and dependency licenses are served locally. Regenerate dependency notices with:

```sh
node scripts/license-notices.mjs
node scripts/license-notices.mjs --website
```

## Deployment

`.github/workflows/pages.yml` publishes `dist-site/` through GitHub Actions. Configure the repository's Pages setting to use GitHub Actions and follow GitHub's [custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
