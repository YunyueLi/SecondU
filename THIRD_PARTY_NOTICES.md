# Third-party notices

SecondU's own source is covered by [LICENSE](LICENSE). That license does not replace the licenses of dependencies, illustrations, fonts or brand marks. Names and logos identify their owners and do not imply endorsement.

## Runtime and interface code

The lockfile is the dependency-version record. A source snapshot of installed production-dependency notices is retained in [runtime-dependencies.txt](docs/licenses/runtime-dependencies.txt), including transitive packages. Regenerate it after a clean install with `node scripts/license-notices.mjs`; optional native packages can differ by installation platform. A downstream distributor must review the dependencies and optional binaries actually shipped.

| Component | License / source |
| --- | --- |
| Official Model Context Protocol TypeScript SDK / Zod | MIT — [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Zod](https://github.com/colinhacks/zod). The optional stdio service ships the server, core and Zod packages; the client package is used only for integration tests. |
| React and React DOM | MIT — [React](https://github.com/facebook/react) |
| Official Apps SDK UI | MIT — [Apps SDK UI](https://github.com/openai/apps-sdk-ui) |
| PDF.js | Apache-2.0 — [PDF.js](https://github.com/mozilla/pdf.js); its worker, CMaps, fonts, ICC and WASM support files are served locally with their bundled notices. |
| DiceBear runtime | MIT code; avatar designs have separate terms below — [DiceBear](https://github.com/dicebear/dicebear) |
| d3-force | ISC — [d3-force](https://github.com/d3/d3-force) |
| jsQR | Apache-2.0 — [jsQR](https://github.com/cozmo/jsQR) |
| Luxon / QRCode | MIT — [Luxon](https://github.com/moment/luxon), [node-qrcode](https://github.com/soldair/node-qrcode) |
| Electron | MIT and bundled Chromium/third-party notices — [Electron](https://github.com/electron/electron); the local packaging script copies the installed Electron application, including its license files. |

OpenClaw is not bundled in the desktop application. The communications setup can download the pinned `openclaw@2026.9.7` runtime and selected official channel packages only after an explicit install action. OpenClaw and the supported separately distributed `@tencent-connect/openclaw-qqbot@2.0.4` and `@wecom/wecom-openclaw-plugin@2026.9.15` packages use MIT licenses; installed package notices remain with each dependency. The local installer records and verifies the selected package versions and registry integrity values. This does not grant rights to platform trademarks or imply that an account has been connected.

Codex CLI and LibreOffice are separately installed runtimes, not bundled copies of their source in this repository. Follow their upstream licenses when redistributing them. OpenJarvis and other research references are not bundled merely because the design documents discuss them.

## Interactive public website

The website has a separate [lockfile](website/package-lock.json). Its installed production dependencies, including React 19.1.1, Apps SDK UI 0.2.2 and Three.js 0.185.1, are recorded in [website-dependencies.txt](docs/licenses/website-dependencies.txt). Three.js uses the MIT license; see the [official source](https://github.com/mrdoob/three.js). After installing the website dependencies, regenerate this snapshot with `node scripts/license-notices.mjs --website`.

The website serves EB Garamond Variable and Noto Serif SC Variable from local Fontsource packages (`@fontsource-variable/eb-garamond` and `@fontsource-variable/noto-serif-sc`, both 5.3.0). Both fonts use the SIL Open Font License 1.1. Their full copyright and license texts are retained in the website dependency snapshot. The fonts are not fetched from a third-party font service.

The browser memory-import adapter uses `@noble/hashes` 2.4.0 for synchronous SHA-256 under the MIT license. Its source and copyright notice are retained in the website dependency snapshot. This dependency is limited to the public website and does not add a desktop runtime dependency.

Shared product components also use packages from the root install, including DiceBear's avatar code and designs, code highlighting and KaTeX. The website builder retains both dependency snapshots, this attribution guide, and the direct Three.js, Apps SDK UI and KaTeX licenses in its `licenses/` output. The snapshots cover installed production packages; their presence does not mean every package is loaded by the website. Dependency source directories, personal runtime data and acceptance logs are not copied into the site.

## Avatar designs

The application generates and combines avatar output locally from the installed styles; seeds, colors and crops can vary. The style selector retains author and license links. The full code/design notices are included in the runtime-dependency notice snapshot.

| Style | Artist / origin | Artwork license |
| --- | --- | --- |
| Adventurer | [Lisa Wischofsky](https://www.figma.com/community/file/1184595184137881796) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Micah | [Micah Lanier](https://www.figma.com/community/file/829741575478342595) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Avataaars | [Pablo Stanley](https://avataaars.com/) | Upstream free personal/commercial-use terms; see the style's retained LICENSE |
| Bottts | [Pablo Stanley](https://bottts.com/) | Upstream free personal/commercial-use terms; see the style's retained LICENSE |
| Lorelei | [Lisa Wischofsky](https://www.figma.com/community/file/1198749693280469639) | CC0 1.0 |
| Notionists | [Zoish](https://heyzoish.gumroad.com/l/notionists) | CC0 1.0 |
| Open Peeps | [Pablo Stanley](https://www.openpeeps.com/) | CC0 1.0 |
| Pixel Art | [DiceBear](https://www.figma.com/community/file/1198754108850888330) | CC0 1.0 |
| Shapes / Thumbs | [DiceBear](https://www.dicebear.com/) | CC0 1.0 |

## Vendored marks and fonts

The public architecture diagrams embed the Archify 3.0.1 viewer under the [MIT license](docs/diagrams/LICENSE.archify.txt). Its JetBrains Mono font uses the [SIL Open Font License 1.1](docs/diagrams/JetBrainsMono-OFL.txt). These notices are also mirrored with the website diagrams. The diagrams select no optional third-party brand vectors. See the [diagram provenance and validation record](docs/diagrams/manifest.json).

- Provider SVGs: Lobe Icons, MIT. [Source records](public/brand/providers/sources.json) and [license](public/brand/providers/LICENSE-lobe-icons).
- Platform and connector marks: primarily Simple Icons, CC0 1.0. Retain [platform attribution](public/icons/platforms/README.md), its source manifests and [license](public/icons/platforms/LICENSE.md); DingTalk's Ant Design mark has its separate MIT attribution. Connector [license](public/icons/connectors/LICENSE.txt) remains alongside the files. Trademarks remain with their owners.
- KaTeX math fonts: MIT; [retained notice](public/fonts/LICENSE.txt).
- Pinyon Script outlines: SIL Open Font License; [retained notice](public/fonts/PinyonScript-OFL.txt). The product wordmark uses project-drawn geometry; system fonts are not redistributed. See [branding provenance](docs/BRANDING.md).

## Project illustrations and examples

The `public/art/` assets and theme atlases include project-generated illustrations. Available `*.prompt.json` records preserve the generator, intended use and source provenance. Keep those records when adapting the assets; a generated image is not a third-party provider logo. Do not claim exclusive rights to model-generated visual elements or use the artwork to imply affiliation.

Seed people, conversations and document fixtures are fictional. They are not a license to redistribute user-imported records or private evidence. Historical brand snapshots retain their original notices and compatibility purpose.
