---
name: office-delivery
description: Create, edit, inspect, recalculate, render or export Word documents, Excel workbooks and PowerPoint presentations. Use for requested DOCX, XLSX, PPTX or Office-to-PDF deliverables.
license: MIT
---

# Office delivery

Adapted from DeepSeek Harness's Office workflows at the revision recorded in PROVENANCE.json. This is an operational workflow, not permission to read unrelated files or install software.

1. Identify the requested output, audience, source files, preserved properties and acceptance criteria. For an edit, inspect the original before changing it and preserve the original until the output is verified. Do not invent source content or create a file for ordinary conversation.
2. Call `secondu_workspace_dependencies` for the absolute Node executable and installed authoring libraries. Use only those returned paths; do not assume global Python, a shell alias or a host-only tool exists. Consult the applicable [Word](references/docx.md), [Excel](references/xlsx.md) or [PowerPoint](references/pptx.md) guide before authoring. You may write a task-local script using the installed libraries for rich layouts.
3. The bundled `scripts/office.mjs` supports `inspect FILE`, `docx SPEC_JSON OUTPUT`, `xlsx SPEC_JSON OUTPUT`, `pptx SPEC_JSON OUTPUT`, `recalculate INPUT OUTPUT`, `pdf INPUT OUTPUT`, and `render INPUT OUTPUT_DIRECTORY [SHEET] [RANGE]`. Invoke with the absolute Node executable. Paths must stay within the task workspace; outputs are exclusive and never overwrite a source. `SECONDU_NODE_MODULES` is provided by SecondU to locate the libraries. Run `help` for the supported JSON structures.
4. Reopen the saved output. Validate content, formulas, sheets/slides, formatting and required preserved properties. A file's existence or valid ZIP structure does not establish correct business logic or visual quality.
5. For layout changes and visual deliverables, use [rendering and verification](references/verification.md). Inspect the actual saved output through the current model's image-reading tool if supported. If no image tool is available, preserve the file and report visual verification as incomplete. Never claim a screenshot was inspected based on a successful command alone.
6. Keep deliverable files in the task workspace. Report the exact filenames, checks actually performed, unresolved limitations and missing fonts. SecondU collects supported task files as artifacts; do not invent a download URL or claim external publication.

## Operational boundaries

The Office renderer is LibreOffice Kit, independently licensed MPL-2.0. It is included as an application dependency; do not download another engine after a conversion failure. A missing engine, cancelled operation or invalid document is a real failure to report. Do not replace formulas with constants, silently switch models, invent a PDF, expose private library files, or overwrite an input to hide a failed check. Native Microsoft Office behavior may differ from rendered previews.
