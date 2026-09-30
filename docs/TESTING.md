# Testing and acceptance

Tests, build output, real provider calls and rendered acceptance are separate evidence. Record the commit/build and the path actually exercised; a previous pass does not certify a changed package.

## Default checks

```sh
npm ci
npm test
npm run build
```

The source test command is `node --test tests/*.test.mjs`. Use Node 22.18+ so direct TypeScript fixture imports can be stripped by Node; on 22.13–22.17, explicitly enable `NODE_OPTIONS=--experimental-strip-types`. The build performs TypeScript checking before Vite bundling.

Default tests use temporary local data, synthetic documents and local protocol servers. They cover state and persistence, approvals, imports, workspace isolation, model adapters, task/team behavior, artifact versions and original bytes, guide fixtures, native startup identity and selected frontend logic. They do not need real model keys, accounts, an SSH host or Codex CLI. Tests marked for an installed runtime or converter are skipped unless opted in.

The CI workflow runs build and default tests on Node 22, on Ubuntu and macOS, with read-only repository permissions and no application secrets. Electron binary download is skipped because CI does not launch the native GUI. This checks source compatibility on those runners; it does not notarize, publish or visually accept a desktop bundle. Hosted results are shown in [GitHub Actions](https://github.com/YunyueLi/SecondU/actions/workflows/ci.yml) after a run exists.

## Targeted examples

```sh
node --test tests/artifact-content.test.mjs tests/artifact-format.test.mjs tests/artifact-pdf.test.mjs tests/office-artifacts.test.mjs
node --test tests/message-revisions.test.mjs tests/room-reactions.test.mjs tests/task-reactions.test.mjs tests/team-runs.test.mjs
node --test tests/guide-progress.test.mjs tests/guide-timing.test.mjs tests/guide-examples.test.mjs
node --test tests/startup.test.mjs tests/runtime-revision.test.mjs
```

Choose tests for the changed contract. Do not add a test that only repeats an implementation detail, or repeatedly run an unchanged suite instead of investigating a failure.

## Opt-in local integration

With Codex CLI installed and discoverable:

```sh
HITHER_TEST_REAL_CODEX=1 npm test
```

These extra checks use the installed Codex process, isolated runtime homes, OS permission checks and local model-protocol fixtures. They are distinct from real cloud-provider evaluation and should not use personal account credentials.

With LibreOffice installed:

```sh
HITHER_TEST_REAL_OFFICE=1 node --test tests/office-artifacts.test.mjs
```

This converts synthetic DOCX, XLSX and PPTX fixtures with the actual local converter and checks valid PDF bytes. It does not guarantee layout fidelity for every Office document. Converter failure and timeout tests are already in the default suite using local fixtures.

## Browser and native review

For interface changes, build and open the actual affected screen. Check the action, resulting state, keyboard path and relevant narrow layout, using fictional data. Do not substitute a screenshot of a previous build.

For artifacts, verify the specific type: source collection → preview → edit where supported → save → reopen → select a historical version → download the selected version. Confirm bytes as well as labels. Office preview is a conversion, while download returns the original Office bytes. A missing-original fixture must stay unavailable.

For runtime work, verify task creation, relevant context and constraints, actual completion/interruption, file contents and persisted state after reopening. A small real provider run proves only that specific path; it does not establish model quality or all-provider compatibility.

For a native delivery, rebuild/package, reopen it and verify the runtime fingerprint, the correct local space and the changed screen. Browser success alone is not native-package acceptance. Keep ad-hoc signing separate from Apple notarization.

Public evidence must contain only fictional data. Private logs, raw personal records and local research archives do not belong in a PR, CI artifact or screenshot gallery.

## Dependency updates

Run `npm audit` when changing dependencies. Electron is pinned to a current stable release, and the installed Apps SDK UI 0.2.2 dependency on Lodash 4.17.21 is narrowly overridden to 4.18.1. The override addresses [CVE-2026-4800](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) and related prototype-pollution fixes without replacing the UI library. Electron 44.5.1 uses the maintained `@electron-internal/extract-zip` instead of the unpatched `extract-zip` package; [the upstream release](https://github.com/electron/electron/releases/tag/v44.5.1) and [platform change](https://www.electronjs.org/docs/latest/breaking-changes#removed-macos-12-support) establish the selected version and macOS 13 minimum. Regenerate license notices and repeat clean install, full tests, source build and native acceptance after updates. An audit with no findings is a dated dependency check, not a security certification.


## Recorded release-candidate evidence — 2026-10-01

The security-dependency update was checked from a clean source copy: install and production build passed; **565 tests: 555 passed, 0 failed, 10 optional checks skipped**. This is the result for that source snapshot, before the subsequent final layout, keyboard-focus and website changes. Those later changes have their own type/build and scoped checks; the earlier suite is not presented as a full rerun of every final change.

The latest local macOS arm64 package uses Electron 44.5.1, Node 24.21.0 and SQLite 3.53.4. Its actual embedded runtime passed isolated service health, source/build fingerprint matching, frontend and PDF resource loading, correct WASM MIME, byte-exact image download and strict ad-hoc signature verification. This does not establish Apple notarization.

Rendered checks separately cover DOCX/XLSX/PPTX previews and DOCX saved versions, plus the preceding native build's market badge proportions, profile heading, message editing and expanded artifact panel with navigation retained. The badge-focus package was subsequently opened: the visible back button received focus and Return restored the front. Pointer and keyboard panel resizing, main-area expansion and Escape restoration retained an unsaved draft; the synthetic file was restored without saving a new version. Later copy, native-titlebar and guide-layout changes require their own rebuilt acceptance. Current website interaction and deployment checks are also recorded separately. See [Development](DEVELOPMENT.md#2026-10-01-发布前文档与应用包核对) and [Iteration](ITERATION.md#2026-10-01-全部连续反馈交付核对).


The final native-chrome follow-up separately verified normal/collapsed navigation, macOS fullscreen and restore, work-panel expansion/Escape, and all three header tabs. The Chinese 520 px history toolbar and corrected complete Office walkthrough note have rendered evidence. A shutdown lifecycle failure was reproduced, fixed, covered by 2 lifecycle tests, and checked by an actual quit/relaunch/quit cycle. American example project browsing now passes 11 US/policy checks, including four real fixture listings and rejection of mismatched/private folders, missing markers, traversal and execution. These are scoped checks, not a replacement for the earlier full suite. See [final native follow-up](DEVELOPMENT.md#2026-10-01-最终原生顶部与引导复核).
