# Changelog

User-visible changes are recorded here. Product decisions and implementation history are available in [Development](docs/DEVELOPMENT.md) and [Iteration](docs/ITERATION.md).

## Unreleased / 待发布

- Keep enlarged dialogs below the macOS window controls and fit their content to short or narrow windows.
- Align the website's expanded-workspace close label and icon in both languages and themes.
- 放大弹窗避开 macOS 窗口按钮，并适应矮窗口和窄窗口的可用空间。
- 官网完整体验的收起文字与关闭图标在中英文、明暗主题下统一对齐。

## 0.2.1 — 2026-10-25

### Added

- Add a native finance workspace with overview, accounts, holdings, market data, liabilities, income and spending, and planning. Inspect asset structure, allocation and account details, customize 13 overview components, and keep original currencies, dates and valuation sources visible.
- Record transactions manually or import local CSV files with column mapping and a confirmation preview. Manage bills, subscriptions, recurring income, budgets, goals, credit records, scenario calculations and local weekly reports; prepare scoped finance snapshots as unsent conversation attachments.
- Add account integrations for Moomoo, Plaid, Teller, TrueLayer, Interactive Brokers Flex and SnapTrade, with preview, account selection, mapping and synchronization.
- Add financial research connections for Alpha Vantage, Morningstar, FactSet, Daloopa, Fiscal.ai, Quartr Pro, Crunchbase, Financial Modeling Prep and LSEG.
- Expand bilingual onboarding to ten chapters with Personal Finance and Set Up Your Workspace, including direct entries into finance and computer settings.
- Add a complete bilingual Finance example with six interactive website views: overview, portfolio, structure, allocation, details and holdings.

### Changed

- Organize Finance, Agents and the library as optional, pinnable modules, with expandable finance and Agent navigation and saved preferences per space. Rework the connector directory into compact service rows and separate account information from setup.
- Bring local runtime checks and SSH computers together in computer settings. Keep checks, remote preparation, execution state and recoverable removal distinct; detect missing or outdated remote components and prevent older requests from overwriting a newer check.
- Use compact home suggestions with separate prompt and source previews, dismiss/restore controls and conversation-specific text drafts. Keep attachment actions in one composer entry and improve narrow-screen tools, project links and navigation.
- Share one persisted accent across the interface and activity glow: six solid colors, Spectrum and a custom color. Spectrum with Subtle activity is the default; the composer uses a soft breathing glow only while work is running and respects reduced motion, pause and completion.
- Open website feature previews over the current reading position, preserve the mounted workspace and unsent drafts, and restore scroll and focus on close. Center the website navigation and simplify its footer, public contact links, theme and language choices.
- Update the model configuration shown in public examples to Kimi K3.1 Pro. Refresh bilingual product media and add Finance overview and portfolio images.
- Maintain the desktop and web dependencies: Electron 44.9.3, MCP client/server 2.3.1, Vite 8.3.5 and Zod 4.6.7, with scoped KaTeX and transitive dependency patches.

### Fixed

- Keep asset-panorama dialogs at a consistent size across views, scroll content beneath stable controls, and align structure, allocation and details with the available width. Improve searchable institution selection and account/liability filters.
- Let short user message bubbles fit their own content when a quoted message is longer. Remove repeated personal-context controls below replies, simplify error and project actions, and preserve dismissed introduction cards.
- Correct stretched segmented controls, small institution labels, duplicate form labels, low-contrast navigation, blurry financial-service icons and responsive layouts across settings, finance and Agent pages.
- Use a declared market time zone for quote timestamps, falling back to the browser's local zone. Keep date-only NAV observations on their original calendar date and show the actual time zone and offset in timestamp details.

See the [release notes](docs/releases/v0.2.1.md), [v0.2.1 version page](https://github.com/YunyueLi/SecondU/releases/tag/v0.2.1) and [finance guide](docs/FINANCE.md).

## 0.2.0 — 2026-10-20

### Added

- Build a personal digital twin from seven material entries: existing sources, text and notes, photos and video, conversations, imported memory, connections, and direct writing. A shared 3D portrait reflects saved materials and confirmed understanding.
- Preserve original files before processing. Inspect source records, review extracted candidates against their evidence, correct or skip suggestions, and carry confirmed context into a new task draft.
- Choose whether direct input is used only for the current task or contributes to personal understanding. Local source changes can trigger an explicitly enabled, read-only assessment and an optional suggestion in the associated conversation.
- Open the dedicated mobile interface from the desktop. Mobile navigation, source reading, imports, conversation tools and settings reuse the same local service and data model.
- Explore twin building in a new bilingual homepage feature section and through the current interactive product example.

### Changed

- Restore the selected Cover Flow material treatment; use dot-and-line navigation and show existing-material or connected status only when the underlying state supports it.
- Unify model, attachment and permission controls across desktop and mobile; use the shared Notion icon and a generic “View full profile” action.
- Update the bilingual README and shared product development record to describe current features and their limits.


[Download and release notes](https://github.com/YunyueLi/SecondU/releases/tag/v0.2.0).

## 0.1.5 — 2026-10-10

### Added

- Add in-app macOS updates through a sidebar download icon, an update group within General settings and the application menu. Official Sparkle 2.9.6 handles the native update window, download, verification and installation; there is no standalone update page.
- Discover releases in the background without automatic downloads or restarts, and show progress from actual download bytes. Update archives are verified with the app's embedded Ed25519 public key.
- Protect ordinary quits and update restarts with checks for drafts, pending edits and active work. The backend drains accepted requests and checks all spaces before closing; timeouts do not forcibly cancel work.
- Preserve the original window and drafts when the macOS close button hides it. Repair startup retry handling and disable feedback inputs while saving.


[Download and release notes](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.5).

## 0.1.4 — 2026-10-08

### Changed

- Show current task activity and recorded elapsed time in a compact summary, with expandable tools, plans and collaborators linked to the existing workbench. Repeated start notifications preserve confirmed results, and represented collaboration updates no longer repeat in the event feed.
- Distinguish approval waits, requests for information, operation review and terminal outcomes. Unconfirmed remote dispatch or connection state is explicit; a lost connection does not imply a stopped task or justify an unverified live timer.
- Improve mobile Hero spacing, text-link visibility, route details and keyboard focus around the product example. Share Hero pause controls, clear transient character trails when paused, and improve theme initialization and static bilingual share metadata.
- Load website development records only when opened and omit redundant frozen task responses from startup data, preserving computed task context, traces and feedback.
- Reduce website artwork transfer with transparent WebP variants, share repeated example data, prioritize the Hero image and defer offscreen video/report UI. Keep slow examples loading after 20 seconds instead of reporting a false failure.
- Widen Hero glyph clearance to an 8px clear edge with a 7px fade, and replace the rejected book artwork with an ivory frame and lavender glass door.
- Exclude only `.DS_Store` Finder metadata during desktop package copying, preserving all other copy rules and framework symlinks.


[Download and release notes](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.4).

## 0.1.3 — 2026-10-02

### Fixed

- Align the native macOS navigation control with the window controls and keep its clickable region separate from draggable window surfaces when navigation collapses.
- Load the website's product example reliably under the published subpath, confirm its ready state and provide an explicit retry after loading failures.
- Keep the homepage's upright, ordered 2ndU characters clear of actual portrait and text shapes in both themes.

### Added

- A 24-scenario personal-context benchmark with six dimensions, three conditions and two repetitions: all 144 attempts, including 143 replies and one timeout, are retained for inspection. The SecondU condition met 43 of 48 decision checks; raw retrieval met 48 of 48. The website shows a compact summary and links to the full report.
- A dedicated privacy illustration and concise bilingual benchmark and artwork notes in the README.


[Download and release notes](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.3).

## 0.1.2 — 2026-10-01

### Added

- Reviewable memory import, individual correction and confirmation, unsent context-bearing task drafts, and portable JSON/Markdown exports.
- Explicitly scoped, revocable read-only MCP context access and a unified setup catalogue for 13 messaging platforms.
- Authored bilingual career discussions with editable comparison outlines, plus the initial 12-call synthetic context comparison.

### Changed

- Rebuild the bilingual website around the actual workspace, page-local imports and editing, and demonstrations that pause on interaction. Improve native navigation collapse, fullscreen and mobile controls.
- See the [release notes](docs/releases/v0.1.2.md) for installation details.

## 0.1.1 — 2026-10-01

See the [release notes](docs/releases/v0.1.1.md).

### Fixed

- Index untouched American example conversations as explicit demo histories so editing a message can preserve the original and create a correctly truncated branch. Existing replies, saved results, user changes and deleted records remain intact.

### Changed

- Restructure the website around the complete desktop example workspace, with capability links and real expert badges. Example actions remain isolated in the browser without model requests or access to personal records.
- Keep desktop bundle and application versions aligned with the root package version.

## [0.1.0](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.0) — 2026-10-01


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

### Compatibility

The macOS build requires Apple silicon and macOS 13 or newer. It is not Apple-notarized. Real tasks require a configured model connection; scheduled work depends on the local service remaining online.

## Prototype history

- **2026-09-30:** Hither was renamed SecondU. The local desktop, bilingual fictional spaces and personal-context product direction were refined. Retained branding snapshots are historical evidence, not current product source.
- **2026-09-29:** Initial local personal-agent workbench, traceable cognition, controlled tasks, persistence and official SDK UI component work entered repository history.
