# Run SecondU locally

[English overview](README.md) · [中文总览](README.zh-CN.md)

## Requirements

| Requirement | Used for |
| --- | --- |
| Node.js 22.18+ and npm | Recommended baseline for install, source build, SQLite and TypeScript-importing tests. `package.json` retains a 22.13 runtime minimum. |
| macOS 13+ for the Electron desktop; Linux for source checks | Desktop releases target Apple Silicon; Linux supports source builds and local tests. |
| Codex CLI, optional for browsing | Required for real model tasks; install separately following the official [Codex repository](https://github.com/openai/codex). |
| Your own model credentials | Required only for real provider calls, configured in the application. |
| LibreOffice, optional | Local DOCX/XLSX/PPTX preview conversion. Original Office downloads do not require it. |

## Use a macOS release archive

Download the macOS app archive from the [v0.2.1 release page](https://github.com/YunyueLi/SecondU/releases/tag/v0.2.1), extract it, then open `SecondU.app`. This build is for **Apple Silicon (arm64), macOS 13+**, with Electron and Node included.

The app uses ad-hoc signing. If macOS blocks the first launch, use the per-application opening option in System Settings → Privacy & Security. To run from source, follow the steps below.

Choose a fictional example to explore without credentials. Real tasks still require a separately installed Codex CLI and your own model connection. Optional Office previews require local LibreOffice.

## Browse without a model key

```sh
git clone https://github.com/YunyueLi/SecondU.git
cd SecondU
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:58645> and choose the Chinese or English example. Browse personal context, conversations, artifacts and saved versions. See the [product walkthrough](docs/PROTOTYPE.md).

## Explore v0.2.1

The ten-chapter product guide includes **Personal finance** and **Set up your workspace**, with direct entry points into the new workspaces. [Version highlights](docs/releases/v0.2.1.md)

1. Open the sidebar's module chooser and pin **Finance**, **Agents** or **Library**. Expand a group to browse its sections; your choice belongs to the current space.
2. In personal space, open **Finance**. Start with a manually recorded account or review the available read-only account providers in **Settings → Connectors**. Record the original currency and date. Add holdings, transactions or a CSV import as needed, then browse bills, subscriptions, budgets, goals and planning. [Finance guide](docs/FINANCE.md)
3. Explore **Overview, Portfolio, Structure, Allocation, Details and Holdings** in the [website's finance story](https://yunyueli.github.io/SecondU/?lang=en#finance), then [open the full finance workspace](https://yunyueli.github.io/SecondU/product/embed.html?space=demo-us-v1&lang=en#finance). Use the desktop app to add your own records, connect accounts and update quotes.
4. Open **Settings → Computer** to check local runtimes or configure an SSH computer, then choose the execution computer in a task draft.
5. Use home suggestions to start a task, browse tool and research connections in the directory, and adjust backgrounds, theme or motion in **Settings → Appearance**.

## Run a real task

1. Install Codex CLI separately. Confirm `codex --version` in your terminal, or set `HITHER_CODEX_BIN` to its executable path before starting the service.
2. Enter personal space and open Settings → Model connections. Select a provider, enter your own credential, then select and explicitly test a model.
3. Create a small local task, such as writing a Markdown preparation list.
4. Inspect actual task events and file contents. Edit one line, save a new version, reopen it and compare downloads from both versions.

A connection check sends a small request to the selected provider and may incur usage charges. Configure your credentials in the application.

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

Electron downloads its runtime on first desktop use; packaging also invokes its official checksum-verifying installer when needed. The packaging script targets macOS, uses the installed Electron build and ad-hoc signs the result. Repackaging keeps the preceding bundle under a timestamped name.

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
| Model configuration needed | Open personal space and check the selected model connection and local Codex installation. |
| Office preview unavailable | Install LibreOffice. Detection uses `PATH` and the usual application locations; download the original in the meantime. |
| PDF preview fails | Record the exact reader error and network response. The bundled worker must have a JavaScript MIME type. A blank browser-plugin fallback is not the renderer. |
| Test fails on Node 22.13–22.17 | Prefer Node 22.18+; for those earlier versions, enable `NODE_OPTIONS=--experimental-strip-types`. |

For a reproducible report, include the commit, Node/OS versions and a synthetic example. Never attach your data directory, model keys or private conversation logs. See [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).
