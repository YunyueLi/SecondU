# Contributing to SecondU

SecondU is a runnable personal-agent prototype. Small, reviewable changes with concrete behavior and evidence are welcome. Product, design, documentation and accessibility contributions matter alongside runtime work.

## Get oriented

Read the [quick start](QUICKSTART.md), [product walkthrough](docs/PROTOTYPE.md), [design system](docs/DESIGN.md) and [local agent guidance](AGENTS.md). For a larger change, open an issue describing the user problem, proposed scope and existing behavior before building it.

Create a focused branch from the current default branch; `codex/` is the convention for agent-assisted branches. Keep unrelated edits separate and preserve existing user work. Do not add a second design system: use the installed official Apps SDK UI components and the shared tokens.

## Implement and verify

```sh
npm ci
npm test
npm run build
```

Use a targeted test while iterating; run the complete local suite and build before submitting a ready change. If a check cannot run, report the exact reason. The [test guide](docs/TESTING.md) explains the optional installed-runtime checks. No model API key belongs in ordinary tests or CI.

- State and persistence changes need meaningful failure-path coverage: interruption, repeated requests, stale versions, workspace isolation or missing data, as applicable.
- Interface changes need a real rendered review of the affected screen, including a relevant narrow layout and keyboard interaction. Use fictional data for screenshots. Passing TypeScript alone does not validate layout.
- Artifact changes must distinguish source bytes, rendered preview, editing and the selected saved version. A filename is not evidence that a file can be previewed or downloaded.
- Model, connector and computer capabilities must report actual state. Do not fabricate execution, imply an account is connected from a logo, or label a local fixture as a real model result.
- Keep public user flows free of implementation details that do not help the user decide or act. Reuse the project's typography, spacing and progressive disclosure.

Update the relevant API/product documentation when behavior changes. Record material iteration decisions and verification boundaries in the existing [Development](docs/DEVELOPMENT.md) and [Iteration](docs/ITERATION.md) records. Add a concise user-visible entry to [Changelog](CHANGELOG.md); do not invent a release date or replace historical evidence.

## Data and assets

Use synthetic fixtures. Never commit `.hither/`, `.local/`, `.env` files, credentials, personal transcripts, exports, screenshots of private records, local research media or runtime logs. A redacted key is still unnecessary test data; create a fake one.

New icons, fonts, avatar styles and illustrations need a source and license record. Preserve third-party copyright notices and distinguish design-artwork licenses from package-code licenses. See [Third-party notices](THIRD_PARTY_NOTICES.md). Generated artwork should retain a reproducible prompt/provenance record when available.

## Pull requests

Explain the concrete problem, the resulting behavior and how you verified it. Include a small screenshot or recording for visual work, using only fictional data, and note remaining limits. State when an agent assisted with implementation if it helps explain provenance or review steps; you remain responsible for the submitted result.

Do not claim provider, browser, native or remote-host acceptance unless that specific path was exercised. Reviewers should be able to reproduce the important behavior from the description without reading a chat transcript.

## Report problems

Use the bug template with steps, expected/actual behavior, commit and environment. A feature proposal should explain the task being improved. Security issues follow [SECURITY.md](SECURITY.md); do not include vulnerabilities or sensitive records in public issue bodies.

Contributions are provided under the project's [MIT license](LICENSE), except assets explicitly documented under their own terms. Be respectful, specific and constructive in reviews; discuss the work and evidence, not the person.
