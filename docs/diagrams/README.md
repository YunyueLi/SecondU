# SecondU architecture diagrams

These diagrams describe the committed core at [`c7e8803`](https://github.com/YunyueLi/SecondU/tree/c7e8803caecdf83524b307365baa35e5cc98d789). Every node links to relevant source lines at that revision. Memory import, MCP and messaging setup added after that revision are outside this pinned view. A control-flow diagram does not establish model quality; the [context comparison](../CONTEXT-BENCHMARK.md) documents that separate evidence.

| View | 中文 | English |
| --- | --- | --- |
| Execution architecture | [Interactive HTML](harness-zh.html), [SVG](harness-zh.svg) | [Interactive HTML](harness-en.html), [SVG](harness-en.svg) |
| Understanding and feedback | [Interactive HTML](understanding-loop-zh.html), [SVG](understanding-loop-zh.svg) | [Interactive HTML](understanding-loop-en.html), [SVG](understanding-loop-en.svg) |

HTML includes optional trace motion, zoom, source inspection and export. SVG is a static, self-contained dual-theme export. The additional `-light.svg` and `-dark.svg` variants let the website follow its explicit theme choice; interactive HTML accepts `?theme=light` or `?theme=dark`. These are canonical Archify exports, with no post-export geometry edits. All formats work without external font or asset requests. Source links open the public GitHub repository only when activated. The website serves identical bytes under `/architecture/`.

## Evidence and maintenance

[manifest.json](manifest.json) binds each public specification, HTML and SVG with SHA-256. All four diagrams passed Archify 3.0.1 showcase validation (9/9, zero errors and warnings), strict artifact checking and the automated browser gate. Light captures at 1440×900 and dark captures at 2048×1320 were also visually reviewed. These checks apply to the standalone diagrams, not to every website embedding or device.

The adjacent JSON files are the editable specifications. With Archify 3.0.1 installed, set `ARCHIFY_SKILL` to its directory, then regenerate into a local evidence folder:

```sh
mkdir -p .local/diagram-review
node "$ARCHIFY_SKILL/bin/archify.mjs" finalize workflow \
  docs/diagrams/understanding-loop-en.json \
  .local/diagram-review/understanding-loop-en.html \
  --repo-root . --quality showcase --json
```

Use `architecture` for the harness diagrams. Preserve the source revision until the references have been checked against a newer commit. Review the result, export the canonical SVG and fixed-theme variants through the viewer, and copy only the checked HTML, SVG and specification into both public directories. Update the manifest hashes and run:

```sh
node scripts/verify-diagrams.mjs
```

Full generator receipts and browser captures remain local because they contain host paths. Do not publish `.archify/` or replace receipt evidence with a screenshot alone.

## Licenses

Diagram content follows this repository's license. The embedded Archify 3.0.1 viewer uses the [MIT license](LICENSE.archify.txt). Its bundled JetBrains Mono font uses the [SIL Open Font License 1.1](JetBrainsMono-OFL.txt), also retained in generated font CSS. No optional third-party brand vectors were selected for these diagrams.
