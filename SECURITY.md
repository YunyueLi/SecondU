# Security and data boundaries

SecondU is a local prototype. There is no stable-release security support window or response-time guarantee yet. Fixes target the current development line; old prototypes and local packages may not receive backports.

## Report a vulnerability privately

Use GitHub's [private vulnerability report](https://github.com/YunyueLi/SecondU/security/advisories/new) when it is enabled. If that form is unavailable, request a private reporting channel from the maintainer through a public issue **without vulnerability details or sensitive material**. Do not publish exploits, keys, personal data or database dumps while arranging the report.

A useful report contains the affected commit, OS/runtime, a minimal synthetic reproduction, impact and any proposed mitigation. Send the least data needed to reproduce it. Do not test against another person's accounts or computers.

## What local means here

The backend binds to `127.0.0.1` and rejects cross-site writes. This is not an authenticated multi-user or internet-facing service. Do not expose the API with port forwarding, a tunnel or a shared reverse proxy. These checks do not defend against a compromised OS account or arbitrary software already running as that user.

The store includes SQLite records, task files and a separate credentials file. Filesystem permissions restrict access; the credentials file is not encrypted with the OS keychain. Secure the machine and any backups accordingly. Runtime data and keys are ignored by Git and must remain outside public source and release artifacts.

## Data leaving the machine

When a real task runs, the selected model provider receives the prompt and selected personal context, including bounded excerpts of explicitly linked sources. The provider's own retention, cost and privacy terms apply. A connection test is also a real provider request.

Configured connectors, remote computers and communication adapters have separate data paths. Review what you select and authorize. The fictional example spaces do not make these accounts real or authorize external actions. Imported text, model responses and tool results are data, not new permissions.

## Execution and previews

Codex runs with isolated runtime state and task permission settings. Approval applies to the requested operation; it is not a blanket guarantee against malicious tool behavior. Full-access settings deliberately widen access. A restart or lost connection does not justify automatically replaying unknown side effects.

HTML/SVG previews are static sandboxed documents with scripts and external resources blocked. PDF uses a locally served PDF.js worker. Modern Office documents are validated, then converted by an optional local LibreOffice process with a temporary profile and a timeout; converted previews are read-only and do not replace original downloads. These boundaries reduce exposure but are not a formal security audit of the parsers or the OS.

Keep Node, the browser, Electron, Codex, LibreOffice and dependencies current. If a file fails validation, use a synthetic reproduction to report it rather than disabling the guard. For routine bugs and setup failures, use [Contributing](CONTRIBUTING.md).
