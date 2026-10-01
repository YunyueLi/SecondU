# SecondU interactive website

This standalone React/Vite website presents SecondU as a personal digital twin: sustained understanding of a person, thoughtful discussion and work that can continue. The homepage keeps a full embedded product workspace alongside reviewed product media; `product/embed.html` also opens the same application independently, with a return-to-website link. Its **fictional 万叶 and Caspian examples** come from the desktop app’s canonical Chinese and English initialization chain. Expert badges reuse the real catalogue entries and components.

Chinese/English and light/dark/system appearance are available; only website preferences persist. There is no application backend, personal API connection, model execution, analytics or account login. Visitors can use a prefilled fictional memory summary or explicitly paste/select their own file, review entries and prepare an editable task draft. This content and other edits remain in page memory and clear on reload. A download contains the currently selected example or visitor-provided content; selecting or confirming memory does not upload it or send a task.

Install the root dependencies for shared product components, then the independent website dependencies:

```sh
npm ci --ignore-scripts
npm ci --prefix website --ignore-scripts
node website/build.mjs
```

The builder bundles React and Three.js into `dist-site/`, using the GitHub Pages base `/SecondU/`. It copies an explicit allowlist of public logos, original artwork with prompt manifests, and local KaTeX fonts with licenses. It never copies the entire app public directory, backend, runtime database or `.local/` acceptance folder. A SHA-256 build manifest records the output. Existing output is replaced only when its `.site-build` marker identifies it as this site's build directory.

The build first type-checks the website and its shared component imports. To validate the Pages base without replacing an active root-mounted preview, run `node website/build.mjs --check-pages`; this writes only to the ignored `.local/acceptance/website-pages-build/` directory.

For a local preview matching the production build:

```sh
node website/build.mjs --base=/
python3 -m http.server 58710 --directory dist-site --bind 127.0.0.1
```

Rebuild with no base override before uploading to Pages. `site.json` records the canonical, repository and release targets. A successful local build does not prove the public site is deployed or the release is available.

## Scope and provenance

- `src/EmbeddedProduct.tsx` loads the desktop `App` inside a sandboxed frame; `src/embed/main.tsx` also supports its independent page. `export-examples.mjs` initializes a temporary Store for each canonical example, exports authored records and build documents, and replaces machine-derived paths with virtual paths. It accepts no existing data directory, opens no socket and never reads the user’s runtime. The build substitutes an in-memory API and isolated storage; `connect-src none` blocks network calls. A fixed `embed-public-assets.json` allowlist supplies public artwork. Theme/locale messages preserve the mounted frame. Real model execution, persistent imports, account connections and external actions require the desktop app.
- `src/Capabilities.tsx` connects personal understanding and editable results to the actual product frame. `src/product-navigation.ts` provides a fixed route allowlist and the independent example URL. `src/ExpertShowcase.tsx` uses the desktop expert templates and badge component.
- `src/DecisionSupport.tsx` introduces discussions about career, housing, education and relationships, then opens one authored career example in the real task workspace. The Chinese and English examples each have four exchanges and an editable comparison outline, grounded in their existing fictional profiles. No model is called, no discussion preference becomes a profile fact, and no outreach is sent. `src/PrivacySection.tsx` explains page-local information, scoped task use, cloud-model context and control over future sharing.
- The browser memory adapter reuses the server’s preview and atomic-review rules through a checked browser-compatible build. It supports summary → review/confirm → editable draft, retains original and revised entries, and never sends the draft automatically. Read-only MCP authorization belongs to the desktop runtime; the website does not grant third-party access.
- `src/FuturePlayground.tsx` links to the product’s own device, marketplace and Dating prototypes, explicitly labelled as development directions. Its five-stage, twelve-direction roadmap distinguishes current scope from planned work. No separate phone, market or dating UI is invented for the website; these previews do not send messages, place orders, make payments or contact people.
- `src/Hero.tsx` and its Three.js scene develop SecondU’s visual identity. Hero motion is under active visual review; a successful build does not establish its acceptance. Five original roadmap illustrations were generated with the built-in image tool and adopted without image alterations. Their source and prompt hashes are preserved in `public/art/roadmap/manifest.json`; the builder verifies the files and ships the six provenance JSON files in `art/roadmap/`. Other artwork follows its public allowlist.
- `src/ProductPreview.tsx` presents reviewed captures of the real application from `docs/readme-assets/`. Its image and video imports are bundled by Vite, with separate Chinese/English and light/dark assets. All 16 posters and eight MP4/GIF pairs keep the original 1280×900 proportions, without cropping, stretching or padding. Videos hold reviewed actual states in order; the task sequence shows existing saved versions rather than a new save, and the correction sequence opens a form without submitting it. Reduced-motion preferences select a static image. `manifest.json` and `motion-manifest.json` record source hashes, dimensions and review scope.
- `src/Development.tsx` and the application’s build timeline use `docs/review.json` as one factual source. Real commit timestamps, published releases and the current local round are separate fields. Both views retain the horizontal timeline of eight real commits and the current local round, selected by default. A shared rail aligns whole nodes and supports buttons, keyboard selection and touch scrolling. Selected details use a compact layout, checks expand on demand, and the published release remains a separate status. Editing a document does not create a new commit or mark a draft release published.
- `src/UnderstandingSystem.tsx` embeds the bilingual Archify understanding/action diagram, with node inspection, trace, zoom and reduced-motion controls. Diagram semantics and model-quality evidence remain separate.
- `screenshots/manifest.json` records previously reviewed, fictional product captures. These supporting source assets are retained for documentation; the interactive website builder does not publish the old screenshot gallery.
- The complete website and shared-product production-dependency notice snapshots, the attribution guide, and the direct Three.js, Apps SDK UI and KaTeX licenses ship in `licenses/`. Regenerate the snapshots from installed dependencies with `node scripts/license-notices.mjs` and `node scripts/license-notices.mjs --website`. Fonts and artwork are served locally.

The workflow `.github/workflows/pages.yml` publishes only `dist-site/`. The repository's Pages setting must use GitHub Actions. Deployment uses GitHub's [custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages); desktop runtime and personal records never belong in Pages.
