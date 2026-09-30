# Run SecondU locally

[English overview](README.md) · [中文总览](README.zh-CN.md)

## Requirements

| Requirement | Used for |
| --- | --- |
| Node.js 22.18+ and npm | Recommended baseline for install, source build, SQLite and TypeScript-importing tests. `package.json` retains a 22.13 runtime minimum. |
| macOS 13+ for the Electron desktop; Linux for source checks | Build and local-test CI targets. Native desktop acceptance currently focuses on macOS arm64. Windows is not verified. |
| Codex CLI, optional for browsing | Required for real model tasks; install separately following the official [Codex repository](https://github.com/openai/codex). |
| Your own model credentials | Required only for real provider calls, configured in the application. |
| LibreOffice, optional | Local DOCX/XLSX/PPTX preview conversion. Original Office downloads do not require it. |

## Use a macOS release archive

If a macOS app archive is attached on [Releases](https://github.com/YunyueLi/SecondU/releases), download and extract it, then open `SecondU.app`. This build is for **Apple Silicon (arm64), macOS 13+**; it is not an Intel or universal build. It includes the Electron and Node runtime, so browsing the example does not require a separate Node installation.

The app is **ad-hoc signed, without a Developer ID signature or Apple notarization**. macOS may block the first launch. Follow macOS's per-application opening controls only if you trust the downloaded source; do not disable system-wide protections. Source archives are also available from GitHub and use the installation steps below.

Choose a fictional example to explore without credentials. Real tasks still require a separately installed Codex CLI and your own model connection. Optional Office previews require local LibreOffice.

## Browse without a model key

```sh
git clone https://github.com/YunyueLi/SecondU.git
cd SecondU
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:58645>. Choose the Chinese or English fictional example. Browse a person's context, a conversation, an artifact and its versions. Example spaces do not run real tasks, connect accounts or trigger automations. The examples are separate namespaces from your personal records.

See [the review walkthrough](docs/PROTOTYPE.md) for the intended experience and implementation boundaries.

## Run a real task

1. Install Codex CLI separately. Confirm `codex --version` in your terminal, or set `HITHER_CODEX_BIN` to its executable path before starting the service.
2. Enter personal space and open Settings → Model connections. Select a provider, enter your own credential, then select and explicitly test a model.
3. Create a small local task using non-sensitive synthetic material. The walkthrough includes an example that writes a Markdown preparation list without sending messages or buying anything.
4. Inspect actual task events and file contents. Edit one line, save a new version, reopen it and compare downloads from both versions.

A connection check makes an actual small request to the selected provider and may incur cost. It is distinct from browsing examples and the default local tests. Missing credentials or unsupported runtime configuration remain errors; there is no silent demo fallback. Existing Codex account login state and personal skills are not reused.

## Develop with live reload

Run these in separate terminals from the repository root:

```sh
npm run server
```

```sh
npm run dev
```

Open <http://127.0.0.1:58644>. Vite uses that strict port and proxies `/api` to `127.0.0.1:58645`. Keep the API on 58645 for the default development setup. After backend edits, restart the backend; frontend edits use Vite's reload.

```sh
npm test
npm run build
```

[Testing details](docs/TESTING.md) explain optional Codex/LibreOffice checks and their scope.

## Desktop window and macOS package

```sh
npm run build
npm run desktop
```

For a local macOS bundle:

```sh
npm run desktop:package
open out/SecondU.app
```

Electron downloads its runtime on first desktop use; packaging also invokes its official checksum-verifying installer when needed. The packaging script targets macOS, uses that installed Electron build and ad-hoc signs the result. It is not an installer, universal binary, Developer ID signature or Apple-notarized release. It preserves the preceding bundle under a timestamped name when repackaging.

The native wrapper selects ports 58645–58649. It reuses a server only if the application version, data-space identity and runtime revision all match. An older build is left running and another free port is selected. Quitting the application stops only the backend it started; closing a macOS window can leave the application running.

## Data paths and environment

| Variable or path | Meaning |
| --- | --- |
| `.hither/` | Default source-checkout data, ignored by Git. |
| `~/Library/Application Support/Hither/` | Retained macOS desktop data root; the store is under `data/`. |
| `HITHER_DATA_DIR` | Explicit store directory override. |
| `HITHER_CODEX_BIN` | Explicit Codex executable path (`HITHER_CODEX_BINARY` is a legacy alias). |
| `PORT` | Standalone backend port; defaults to 58645. |

Use a new data directory for isolated experiments. Do not delete or overwrite existing data to resolve a startup problem. Before a backup, stop the services that use the store and copy the whole data directory. Credentials live separately within that directory and need the same care as the database.

## Common checks

| Symptom | Check |
| --- | --- |
| Port 58644 is occupied | Close your previous Vite process or use that existing development tab. Do not terminate an unrelated process. |
| UI loads but API does not | Confirm the backend is running on 58645; inspect its terminal error and `/api/health`. |
| Old packaged behavior persists | Rebuild/package, reopen the app and inspect `/api/health` revision; see the read-only comparison command in [Harness](docs/HARNESS.md). |
| Model configuration needed | Check the selected connection and local Codex availability in personal space. The examples intentionally do not execute. |
| Office preview unavailable | Install LibreOffice. Detection uses `PATH` and the usual application locations; download the original in the meantime. |
| PDF preview fails | Record the exact reader error and network response. The bundled worker must have a JavaScript MIME type. A blank browser-plugin fallback is not the renderer. |
| Test fails on Node 22.13–22.17 | Prefer Node 22.18+; for those earlier versions, enable `NODE_OPTIONS=--experimental-strip-types`. |

For a reproducible report, include the commit, Node/OS versions and a synthetic example. Never attach your data directory, model keys or private conversation logs. See [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).
