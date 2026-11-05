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
| Sparkle 2.9.6 | MIT with bundled component notices — [official release](https://github.com/sparkle-project/Sparkle/releases/tag/2.9.6), [complete unmodified upstream license](docs/licenses/Sparkle-2.9.6.txt). The macOS app embeds the official framework and its installer helpers; SecondU supplies a small N-API adapter. The pinned archive identity is recorded in `desktop/native/vendor-lock.json`. |

OpenClaw is not bundled in the desktop application. The communications setup can download the pinned `openclaw@2026.9.7` runtime and selected official channel packages only after an explicit install action. OpenClaw and the supported separately distributed `@tencent-connect/openclaw-qqbot@2.0.4` and `@wecom/wecom-openclaw-plugin@2026.9.15` packages use MIT licenses; installed package notices remain with each dependency. The local installer records and verifies the selected package versions and registry integrity values. This does not grant rights to platform trademarks or imply that an account has been connected.

Desktop packages built from current source bundle the official **Codex CLI 0.165.0** platform artifact, pinned in [shared/codex-runtime.json](shared/codex-runtime.json). Codex is licensed under Apache-2.0; its [LICENSE](docs/licenses/codex-0.165.0-LICENSE.txt) and [NOTICE](docs/licenses/codex-0.165.0-NOTICE.txt) are retained and copied into the bundle. Companion resources retain upstream third-party licenses, source references and notices, including the voice resource's LGPL and other license texts. The repository does not track downloaded native binaries. See [runtime packaging](docs/CODEX-RUNTIME.md) for the update process. The historical published v0.2.1 archive does not contain this new component.

LibreOffice preview conversion can use a separately installed runtime; bundled document capabilities and their dependencies are described above. OpenJarvis and other research references are not bundled merely because the design documents discuss them.

## Interactive public website

The website has a separate [lockfile](website/package-lock.json). Its installed production dependencies, including React 19.1.1, Apps SDK UI 0.2.2 and Three.js 0.185.1, are recorded in [website-dependencies.txt](docs/licenses/website-dependencies.txt). Three.js uses the MIT license; see the [official source](https://github.com/mrdoob/three.js). After installing the website dependencies, regenerate this snapshot with `node scripts/license-notices.mjs --website`.

The homepage uses Albert Sans Variable from `@fontsource-variable/albert-sans` 5.3.0, with platform CJK sans-serif fallbacks. EB Garamond Variable and Noto Serif SC Variable remain available to existing website surfaces from local Fontsource packages (`@fontsource-variable/eb-garamond` and `@fontsource-variable/noto-serif-sc`, both 5.3.0). These fonts use the SIL Open Font License 1.1. Their full copyright and license texts are retained in the website dependency snapshot. The fonts are not fetched from a third-party font service.

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

- Currency selector flags: flag-icons 7.6.0, MIT. [Source records](src/finance/flags/sources.json) and [retained license](docs/licenses/flag-icons-7.6.0.txt).
- Provider SVGs: Lobe Icons, MIT. [Source records](public/brand/providers/sources.json) and [license](public/brand/providers/LICENSE-lobe-icons).
- Platform and connector marks: primarily Simple Icons, CC0 1.0. Retain [platform attribution](public/icons/platforms/README.md), its source manifests and [license](public/icons/platforms/LICENSE.md); DingTalk's Ant Design mark has its separate MIT attribution. Connector [license](public/icons/connectors/LICENSE.txt) remains alongside the files. Trademarks remain with their owners.
- KaTeX math fonts: MIT; [retained notice](public/fonts/LICENSE.txt).
- Pinyon Script outlines: SIL Open Font License; [retained notice](public/fonts/PinyonScript-OFL.txt). The product wordmark uses project-drawn geometry; system fonts are not redistributed. See [branding provenance](docs/BRANDING.md).

## Project illustrations and examples

The `public/art/` assets and theme atlases include project-generated illustrations. Available `*.prompt.json` records preserve the generator, intended use and source provenance. Keep those records when adapting the assets; a generated image is not a third-party provider logo. Do not claim exclusive rights to model-generated visual elements or use the artwork to imply affiliation.

Seed people, conversations and document fixtures are fictional. They are not a license to redistribute user-imported records or private evidence. Historical brand snapshots retain their original notices and compatibility purpose.

## ZCode workflow layout

`src/agents/zcode-phase-layout.ts` adapts pure parallel-band and arc-lane algorithms from [zai-org/ZCode](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/packages/ui/src/components/workflow-timeline/timeline-bands.ts), commit `3c5b227649371507ddc4eb46ac5133afe6db1cab`, under Apache-2.0. Unused edge-folding and stream rendering were removed. SecondU supplies its own prerequisite graph and execution state; station proportions and scrolling interaction also follow the upstream presentation design. The [license and original upstream notice](docs/licenses/ZCode-Apache-2.0.txt) are retained. The upstream product descriptions in that notice describe ZCode, not SecondU.

The workflow run digest, completion receipt, phase inspector, actor conversation, and artifact presentation also follow the UI structures documented in that revision: `WorkflowRunDigest.tsx`, `WorkflowCompletionCard.tsx`, `WorkflowRunPhaseList.tsx`, `WorkflowActorSessionSidePane.tsx`, and `SubagentSessionSidePane.tsx`. SecondU adapts them to its Apps SDK UI components and persisted task events; it does not bundle the upstream application.


`src/agents/zcode/` includes extracted presentation components, supporting geometry, and scoped workflow styles from the same Apache-2.0 revision. Module and protocol adapters connect SecondU data and actions. Button, identity, theme, and formatting adapters use SecondU's design system; completion values render without the upstream counter animation. The horizontal dependency view uses SecondU's earlier explicit-edge renderer after user review; the vertical phase list and completion/artifact components retain the extracted upstream structure.


The extracted vertical phase list also accepts SecondU's explicit dependency renderer (`WorkflowPhaseConnections.tsx`), replacing the upstream decorative spine joints. Phase, roster, and actor interaction structure remains adapted from the same upstream revision.
