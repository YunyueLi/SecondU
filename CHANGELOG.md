# Changelog

User-visible changes are recorded here. Detailed decisions and scoped checks remain in [Development](docs/DEVELOPMENT.md) and [Iteration](docs/ITERATION.md). Published releases are tied to a tag and commit; subsequent changes remain under Unreleased.

## 0.1.5 — 2026-10-10

### Added

- Add in-app macOS updates through a sidebar download icon, an update group within General settings and the application menu. Official Sparkle 2.9.6 handles the native update window, download, verification and installation; there is no standalone update page.
- Discover releases in the background without automatic downloads or restarts, and show progress from actual download bytes. Update archives are verified with the app's embedded Ed25519 public key.
- Protect ordinary quits and update restarts with checks for drafts, pending edits and active work. The backend drains accepted requests and checks all spaces before closing; timeouts do not forcibly cancel work.
- Preserve the original window and drafts when the macOS close button hides it. Repair startup retry handling and disable feedback inputs while saving.

### Validation and delivery

- The complete local source run passed 765 of 775 checks, with 10 existing environment-dependent skips and no failures. The final feedback fix separately passed type checking and five related checks. Release-commit [CI 37960044495](https://github.com/YunyueLi/SecondU/actions/runs/37960044495) and [Product website 37960044610](https://github.com/YunyueLi/SecondU/actions/runs/37960044610) succeeded.
- Isolated native acceptance rejected an archive with an invalid signature without changing the old app or data. A real unsent draft blocked relaunch and remained intact; clearing the synthetic draft allowed installation and automatic relaunch into 0.1.5, preserving task records, artifact versions and file bytes. Both test versions contain this updater; the test's 0.1.4 is not the historical release.
- The production package passed independent extraction, strict signatures and source correspondence. The installed app retained existing domain records and artifact files; its actual General settings and Sparkle window confirmed version 0.1.5 is up to date after publication. The Dock points to the canonical installed app.
- [v0.1.5](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.5) was published at **2026-10-09 16:48:45 UTC / October 10 00:48:45 in Beijing**, tagged at `2cef8a6ab17ca30aa7c6a7094b2eddf2f85fd7eb`. Official Keychain-backed signing and independent Ed25519 verification passed. All three uploaded assets and anonymous HTTPS downloads match the sealed files; independent Ed25519 verification of the public ZIP and feed version, architecture and minimum-system checks passed. Exact digests are recorded in the [release notes](docs/releases/v0.1.5.md).
- Earlier versions need one manual installation of this first updater-enabled release. The app targets Apple silicon and macOS 13+, uses ad-hoc signing and is not Apple-notarized. Native active-task refusal, permission errors, a full background-check cycle and simultaneous sidebar/native progress comparison were not performed; scoped source and child-process checks remain separate.

## 0.1.4 — 2026-10-08

### Changed

- Show current task activity and recorded elapsed time in a compact summary, with expandable tools, plans and collaborators linked to the existing workbench. Repeated start notifications preserve confirmed results, and represented collaboration updates no longer repeat in the event feed.
- Distinguish approval waits, requests for information, operation review and terminal outcomes. Unconfirmed remote dispatch or connection state is explicit; a lost connection does not imply a stopped task or justify an unverified live timer.
- Improve mobile Hero spacing, text-link visibility, route details and keyboard focus around the product example. Share Hero pause controls, clear transient character trails when paused, and improve theme initialization and static bilingual share metadata.
- Load website development records only when opened and omit redundant frozen task responses from startup data, preserving computed task context, traces and feedback.
- Reduce website artwork transfer with transparent WebP variants, share repeated example data, prioritize the Hero image and defer offscreen video/report UI. Keep slow examples loading after 20 seconds instead of reporting a false failure.
- Widen Hero glyph clearance to an 8px clear edge with a 7px fade, and replace the rejected book artwork with an ivory frame and lavender glass door.
- Exclude only `.DS_Store` Finder metadata during desktop package copying, preserving all other copy rules and framework symlinks.

### Validation and status

- Candidate source tests, type checking and website builds passed. Browser previews covered eight task states, review and rejection, remote disconnection, repeated start notifications and 320px/390px layouts; these checks use synthetic task events.
- Two Kimi K3 max visual reviews informed the fixes; the second found no new release blockers within its visible scope. The native 0.1.4 app reopened existing history and example artifacts, and package identity, dependency coverage and strict ad-hoc signature verification passed. The final ZIP passed extraction checks and an isolated empty-data backend check; that process was closed without invoking a real provider.
- [Source CI 37730878799](https://github.com/YunyueLi/SecondU/actions/runs/37730878799) passed for release commit `835b11302a0ee0142a082ff6d0f55c385e2554da` on Node 22, on both macOS and Ubuntu. Each platform ran 719 checks: 709 passed, 10 environment-dependent skips, zero failures. These counts remain separate from earlier local checks.
- [Pages 37730416743](https://github.com/YunyueLi/SecondU/actions/runs/37730416743) succeeded for website commit `ca2d887a517a9ea3aed00fd8da18f7cad2ef5107`. The following release commit changes only Finder-metadata filtering in the packager; website runtime code is unchanged.
- [v0.1.4](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.4) was published at **2026-10-08 05:16:38 UTC**, tagged at `835b11302a0ee0142a082ff6d0f55c385e2554da`. Public asset sizes and SHA-256 digests match the verified local files:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `SecondU-v0.1.4-macos-arm64.zip` | 221,970,343 | `c45913997eb6ba3e949b2270037cb084a6e19dfdaa23f80a7f0f6c6a887841ec` |
| `SHA256SUMS` | 97 | `8efa07c6ed33ad50c0493ffac801cf48fc36349bba1c01d41e638d8675c473b6` |

`SHA256SUMS` covers only the ZIP. The published archive retains the documents sealed at the release commit; later publication records update source documentation without changing the archive, signature or digests. The live site was reopened in the in-app browser, with the paused Hero and product-ready state checked. Earlier native acceptance covers the unchanged release runtime; no additional native or Safari screen check was performed after device lock. No new real-provider, award or public-network performance result is claimed. See the [v0.1.4 release record](docs/releases/v0.1.4.md).

## 0.1.3 — 2026-10-02

### Fixed

- Align the native macOS navigation control with the window controls and keep its clickable region separate from draggable window surfaces when navigation collapses.
- Load the website's product example reliably under the published subpath, confirm its ready state and provide an explicit retry after loading failures.
- Keep the homepage's upright, ordered 2ndU characters clear of actual portrait and text shapes in both themes.

### Added

- A 24-scenario personal-context benchmark with six dimensions, three conditions and two repetitions: all 144 attempts, including 143 replies and one timeout, are retained for inspection. The SecondU condition met 43 of 48 decision checks; raw retrieval met 48 of 48. The website shows a compact summary and links to the full report.
- A dedicated privacy illustration and concise bilingual benchmark and artwork notes in the README.

### Validation and status

- Candidate checks: 645 passed, 10 environment-dependent skips, no failures. Package and unpacked-archive runtime checks, read-only MCP and ad-hoc signature verification passed.
- The verified final app passed 30 native sidebar toggles: six each on Home, Agents, a conversation, an expanded workbench and macOS fullscreen. Leaving fullscreen restored the window. Empty-title-bar dragging preserved the content and controls; window displacement was not measured.
- v0.1.3 was published at 2026-10-02 00:00:47 UTC. Both public asset digests and sizes match the verified local files. External Kimi review could not read its credential and produced no result; see the [v0.1.3 release notes](docs/releases/v0.1.3.md).


## 0.1.2 — 2026-10-01

### Added

- Reviewable memory import, individual correction and confirmation, unsent context-bearing task drafts, and portable JSON/Markdown exports.
- Explicitly scoped, revocable read-only MCP context access and a unified setup catalogue for 13 messaging platforms.
- Authored bilingual career discussions with editable comparison outlines, plus the initial 12-call synthetic context comparison.

### Changed

- Rebuild the bilingual website around the actual workspace, page-local imports and editing, and demonstrations that pause on interaction. Improve native navigation collapse, fullscreen and mobile controls.
- Record 633 passed checks, 10 environment-dependent skips and no failures, plus 22 passing website checks. External Kimi review did not produce a result.
- Retain the runtime tag at `33b0889`; the final archive includes three post-publication documentation updates from `bbf4c32`, with 1,500 compared runtime, frontend, dependency and benchmark files unchanged. See [release notes and package provenance](docs/releases/v0.1.2.md).

## 0.1.1 — 2026-10-01

See the [release notes](docs/releases/v0.1.1.md). Publication and the release commit are recorded separately.

### Fixed

- Index untouched American example conversations as explicit demo histories so editing a message can preserve the original and create a correctly truncated branch. Existing replies, saved results, user changes and deleted records remain intact.

### Changed

- Restructure the website around the complete desktop example workspace, with capability links and real expert badges. Example actions remain isolated in the browser without model requests or access to personal records.
- Keep desktop bundle and application versions aligned with the root package version.

## [0.1.0](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.0) — 2026-10-01

Release target: [`c6eb3019c43faa124501e4540354e4e39e96c8e8`](https://github.com/YunyueLi/SecondU/commit/c6eb3019c43faa124501e4540354e4e39e96c8e8).

### Added

- Original-preserving message revision branches, quoted replies and message reactions.
- Lead-based teams with on-demand specialist execution records, separate from saved member identities.
- Format-specific artifact cards and previews: highlighted code, Markdown, CSV/TSV, static HTML/SVG, images and a local PDF reader. Modern Office files can use optional LibreOffice conversion while retaining their originals.
- Updated onboarding scenes using product components for message iteration, team setup, dispatched work and file formats; fictional demonstrations remain labelled.
- Public project documentation, contribution and security guidance, issue/PR templates and source-build/local-test CI configuration.
- A bilingual website with local interactive examples, a portrait particle scene, theme controls and explicit development previews. Website deployment is recorded separately.

### Changed

- Model providers are directly selectable in a compact grid; permission controls and collaboration settings use a compact layout.
- Shared work panels resize by pointer or keyboard and expand within the main workspace while keeping navigation available.
- Four original decorative themes, clearer personal-profile headings and compact context controls follow the shared visual language.
- Example-space entry and exit are direct actions. Example data remains separate from personal records.
- Development review uses an updateable visual timeline with underlying evidence links.
- Product branding is SecondU; compatible Hither data paths, environment variables and internal identities remain.

### Fixed

- Updated the desktop runtime to Electron 44.5.1 and its maintained ZIP extractor; narrowly override the SDK Lodash dependency to patched 4.18.1. The desktop now requires macOS 13 or newer.

- Market badges scale as a complete card; flipping a badge hands keyboard focus to the visible side.
- Production CSS cascade initialization preserves official SDK component styling after bundling.
- PDF worker and WASM responses have the correct MIME types under `nosniff`.
- Native startup matches the data space and a content-based runtime revision before reusing a backend, leaving incompatible listeners alone.
- Historical artifact selection now keeps the title, preview and exact-byte download on the same saved version. Unsaved drafts do not silently become downloads.

### Scope

No notarized desktop distribution, verified Windows support, all-provider certification or general remote-host acceptance is claimed. Current evidence is linked in the development record. Source CI, website deployment and the native release are recorded independently; their success does not certify every product capability.

## Prototype history

- **2026-09-30:** Hither was renamed SecondU. The local desktop, bilingual fictional spaces and personal-context product direction were refined. Retained branding snapshots are historical evidence, not current product source.
- **2026-09-29:** Initial local personal-agent workbench, traceable cognition, controlled tasks, persistence and official SDK UI component work entered repository history.
