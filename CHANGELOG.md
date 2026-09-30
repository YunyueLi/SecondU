# Changelog

User-visible changes are recorded here. Detailed decisions and scoped checks remain in [Development](docs/DEVELOPMENT.md) and [Iteration](docs/ITERATION.md). The package version `0.1.0` identifies the prototype; it does not establish a published release.

## Unreleased

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

No notarized desktop distribution, verified Windows support, all-provider certification or general remote-host acceptance is claimed. Current evidence is linked in the development record; CI configuration is not itself a successful hosted run.

## Prototype history

- **2026-09-30:** Hither was renamed SecondU. The local desktop, bilingual fictional spaces and personal-context product direction were refined. Retained branding snapshots are historical evidence, not current product source.
- **2026-09-29:** Initial local personal-agent workbench, traceable cognition, controlled tasks, persistence and official SDK UI component work entered repository history.
