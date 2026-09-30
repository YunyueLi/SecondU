# Local backend and runtime

This is the current backend entry point. Earlier acceptance records remain in [Development](../docs/DEVELOPMENT.md) and [Harness](../docs/HARNESS.md); their dates and test scope must not be interpreted as acceptance of every later feature.

## Start and identity

Run `node server/index.mjs` with Node 22.13+; 22.18+ is recommended for the complete source/test workflow. The service listens on `127.0.0.1`, using `PORT` or 58645. `HITHER_DATA_DIR` defaults to the ignored `.hither/` directory. See [Quick start](../QUICKSTART.md) and [Testing](../docs/TESTING.md).

`GET /api/health` returns the application, version, `spaceId` and `revision`. The space identity hashes the resolved store directory without revealing its path. The revision fingerprints actual runtime/shared source and the built frontend entry. Native startup requires both identities to match before reusing a server; it leaves mismatched listeners untouched.

`HITHER_CODEX_BIN` explicitly selects an installed Codex executable; `HITHER_CODEX_BINARY` is a compatibility alias. Otherwise, detection checks the supported PATH/application locations. A failing explicitly selected executable does not silently switch to a different runtime. The adapter uses isolated runtime state, not the user's existing Codex account home.

## State and data

The backend owns SQLite records, task states, version history, source references, scheduler state, task files and separate credentials. Credential files have restricted local permissions; they are not keychain-encrypted. Bootstrap returns presence/masked metadata, and exports exclude credentials/runtime state. No real private records are included in the example seeds.

Sources are immutable evidence; corrections are new sources and reviewed cognition revisions. Context assembly is bounded and records the selected facts, revisions and source excerpts. Imported content and model output cannot grant permissions. Missing provenance remains unknown.

Personal and fictional example spaces are separate namespaces. Production example spaces can be browsed but cannot start models, connect real accounts or run automations. Deterministic demo execution exists in isolated development/test fixtures; it is labelled and does not establish model quality.

## Task execution

Real tasks use Codex app-server through `codex.mjs`, with the configured provider adapter, streaming events, task permissions, approvals and interruption. Missing configuration remains `needs_input`; there is no silent demo fallback. Responses, Chat Completions and Messages paths have separate adapters. A provider preset or small connection test does not certify every tool, reasoning or multimodal capability.

Group discussion and lead-based teams are different paths. A configured team lead can delegate bounded work to selected specialists, inspect status and wait for results. `team-runs.mjs` records actual dispatched nodes; saved agent identities are not automatically running workers. The current coordinator permits four concurrent worker nodes and eight total nodes per run. Uncollected workers prevent final completion. Cancellation, failure and restart preserve honest state rather than inventing successful work.

A sent-message revision creates a new task/room branch and preserves original history. Revision requests use an idempotency key. Reaction changes, quoted references and room operations enforce their existing task/space boundaries. See [API](../docs/API.md) for contracts.

Approvals resolve a request once. Restart invalidates stale local approvals and marks unfinished local work interrupted. Remote tasks retain last-observed state and query their own runtime when reconnecting; a lost connection does not trigger automatic replay of unknown side effects. See [Remote computers](../docs/REMOTE-COMPUTERS.md).

## Artifacts and previews

Task files are collected under explicit extension, regular-file, path, content and size rules. Supported text files, images, PDFs and modern Office documents retain their source content; binary formats require validated original bytes and metadata. Symlinks, traversal, malformed containers, credential-bearing content and files outside the collection contract are rejected. Unchanged project files are not attributed to the agent.

Every saved revision remains inspectable. Concurrent text edits use `baseVersion` conflict checks and cannot overwrite a file during live execution. Images, PDF and Office are read-only in the text editor. Failed or interrupted runs can leave files marked pending review without changing the run to completed.

`GET /api/artifacts/:id/download?version=N` returns exact saved bytes and `X-Artifact-Version`; a missing query selects latest. Invalid or repeated version queries fail, and a missing revision is never replaced with the current one. The Office preview endpoint converts the selected DOCX/XLSX/PPTX revision to PDF using an optional local LibreOffice process. Conversion does not replace original bytes. The frontend PDF.js worker is served locally with the correct JavaScript/WASM MIME types.

## Scheduling and external resources

Schedules execute only while the service is running. Overdue intervals produce a bounded catch-up, not a replay of every missed tick. Pending work prevents duplicates. New imports remain saved even when their associated trigger is skipped during an existing run. No cloud wakeup, sleep execution or cross-device synchronization is implied.

External connector discovery, permissions, credentials and communication resources have their own state and checks. Their catalogue presence does not prove a real account is connected. Review [Connectors](../docs/CONNECTORS.md), [Communications](../docs/COMMUNICATIONS.md) and [Security](../SECURITY.md) before extending those paths.

## Evidence

The default suite uses synthetic local fixtures. Optional installed-Codex checks exercise real process/sandbox/protocol behavior without cloud-provider calls; optional LibreOffice checks convert synthetic documents using the installed application. A separate small real DeepSeek team run is recorded in [Prototype](../docs/PROTOTYPE.md). Each proves its stated path only.

For source references, use the installed runtime's protocol schema and the official [Codex repository](https://github.com/openai/codex). Product-specific implementation and acceptance details live in the canonical API, Harness and development records, rather than an additional duplicated history here.
