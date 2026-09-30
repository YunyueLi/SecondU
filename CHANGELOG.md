# Changelog

User-visible changes are recorded here. Detailed decisions and scoped checks remain in [Development](docs/DEVELOPMENT.md) and [Iteration](docs/ITERATION.md). Published releases are tied to a tag and commit; subsequent changes remain under Unreleased.

## Unreleased

## 0.1.2 — 2026-10-01

### Changed

- Align the product documentation, roadmap closing line and website sharing summary with the current Hero message. Product capabilities and verification limits are unchanged from v0.1.1. See the [release notes](docs/releases/v0.1.2.md).

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
