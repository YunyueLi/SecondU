# SecondU interactive website

This standalone React/Vite website embeds the actual product workspace and real product UI components. Its **fictional 万叶 and Caspian example workspaces** are exported through the desktop app’s canonical Chinese and English initialization chain. Capability links navigate that single workspace, while expert badges reuse the real catalogue entries and components. The website does not maintain a second, simplified product simulation. Chinese and English copy, and light/dark/system appearance, are available throughout; only those website preferences persist. It has no application backend, personal API connection, model requests, analytics or account login. Demonstration edits reset when the page reloads; downloads contain only fictional example data and edited files.

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

- `src/EmbeddedProduct.tsx` loads the actual desktop `App` inside a sandboxed frame. `export-examples.mjs` initializes a new temporary Store for each canonical example, exports its authored records and build documents, and replaces machine-derived paths with virtual example paths. It accepts no existing data directory, opens no socket, and never reads the user's runtime. The build substitutes an in-memory API and isolated in-memory storage; a `connect-src none` policy blocks network calls. A fixed `embed-public-assets.json` allowlist supplies public artwork. Drafts and versions stay in the page, and locale/theme messages preserve the frame. Real model execution, imports, accounts and external actions require the desktop app.
- `src/Capabilities.tsx` describes the implemented features and routes each entry to the same actual product frame. `src/product-navigation.ts` provides a fixed route allowlist; links never accept an external destination. `src/ExpertShowcase.tsx` uses the desktop expert templates and badge component.
- `src/FuturePlayground.tsx` links to the product’s own device, marketplace and Dating prototypes, explicitly labelled as development directions. Its twelve-part roadmap distinguishes current scope from planned work. No separate phone, market or dating UI is invented for the website; these previews do not send messages, place orders, make payments or contact people.
- `src/Hero.tsx` is a code-native interpretation of SecondU's original identity. Product artwork comes from `public/art/`, with provenance manifests shipped beside each included image.
- `screenshots/manifest.json` records previously reviewed, fictional product captures. These supporting source assets are retained for documentation; the interactive website builder does not publish the old screenshot gallery.
- The complete website and shared-product production-dependency notice snapshots, the attribution guide, and the direct Three.js, Apps SDK UI and KaTeX licenses ship in `licenses/`. Regenerate the snapshots from installed dependencies with `node scripts/license-notices.mjs` and `node scripts/license-notices.mjs --website`. Fonts and artwork are served locally.

The workflow `.github/workflows/pages.yml` publishes only `dist-site/`. The repository's Pages setting must use GitHub Actions. Deployment uses GitHub's [custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages); desktop runtime and personal records never belong in Pages.
