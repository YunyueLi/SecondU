# Personal-context comparison

This suite checks the cold-start and learning contract on a small, explicitly synthetic fixture. It does not read a personal store, import credentials or contact a model. It keeps deterministic retrieval checks separate from model-answer evaluation.

Run:

```sh
node scripts/benchmark-context.mjs
node --test tests/context-benchmark.test.mjs
```

The command writes `report.json` (exact model-ready inputs, hashes and checks) and `report.md` into `.local/context-benchmark/`. An explicit `--output directory` changes the output directory. Each run uses a temporary empty store, the production import/confirmation/revision/context functions, and then removes only that temporary store. Runtime-generated IDs and revision timestamps are recorded in the run's input manifest; use that saved manifest when comparing model outputs.

## Cases and conditions

The fictional subject chooses among priced weekend visits. Every case has three inputs with the same task and system instruction:

- **No context:** the production context selector with the digital twin disabled.
- **Raw archive:** the actual append-only text sources, including the original statement and later correction.
- **Structured context:** the production selector's current confirmed entries, revisions, source references and budget.

The sequence is:

1. Make an initial choice that depends on a confirmed travel preference and spending constraint.
2. Confirm a continuing preference change, then repeat the same choice.
3. Apply an explicit exception to this visit only. The stored import remains a candidate.
4. Start a different task and use the corrected continuing preference without promoting the one-time exception.

The fixture includes a plainly labeled unconfirmed canary and an unrelated fictional value. Neither is a real credential or person's data. The raw archive deliberately represents an unfiltered archive baseline; its inclusion of these strings measures unnecessary input exposure, not an observed leak by a model.

## Offline measurements

For each input the report records exact input characters, relevant-statement presence, superseded preference presence, candidate exposure and unrelated-canary exposure. For the structured condition it checks the current confirmed revision, spending constraint, candidate exclusion, unrelated data exclusion, no automatic exception learning, the disabled-context boundary and the configured size budget.

The current four-case fixture passes 28 contract checks. This is a regression signal, not a statistical benchmark of broad personal understanding. Structured context can be longer than a tiny raw fixture because its provenance and revision metadata have overhead; the report retains the measured sizes rather than claiming token savings. Character counts are not token counts.

## Model comparison protocol

`report.json` intentionally sets `modelEvaluation.status` to `not_run` and `qualityScore` to `null`. A model score is valid only after actual generation:

1. Freeze one report manifest. Use the same explicitly selected model version, provider, settings and output limit for all 12 inputs; isolate conversation state for every condition and case. Do not send reference answers to the model.
2. Record the request/input SHA-256, provider-reported model identifier, parameters, full reply, token usage, duration and any errors. Randomize condition order and repeat if drawing quality conclusions; one run is illustrative only.
3. Evaluate concrete choice and reasoning together. For the structured condition the expected choices are A, B, A and E. Verify that the reason uses applicable constraints and acknowledges the one-time exception. A correct letter without grounded reasoning is insufficient.
4. In the no-context condition, asking for the missing personal preference is valid. Do not penalize it for failing to know withheld information. Compare the usefulness and specificity of the response, not just agreement with a hidden answer.
5. Check unsupported personal claims, canary repetition, mistaken use of superseded context and unwanted generalization of the exception. Separate an input-exposure finding from actual output disclosure.
6. Have a reviewer assess the replies without condition labels where practical. Report each metric and failed example; do not collapse retrieval, privacy and answer quality into one invented overall score.

No private profile is needed for this experiment. Selecting a model connection authorizes only these saved synthetic inputs; it does not authorize scanning other stores or exporting account keys. Real generation results, when available, should be stored alongside this report with their provenance rather than replacing the offline contract result.

See [MEMORY-IMPORT.md](MEMORY-IMPORT.md) for import confirmation and [INTEROPERABILITY.md](INTEROPERABILITY.md) for the separately authorized MCP context interface.

## Explicit real-model runner

On macOS, an existing logged-in Codex CLI account can run the synthetic inputs without reading a SecondU store:

```sh
node scripts/benchmark-context-model.mjs --run --smoke --model YOUR_SELECTED_MODEL --output .local/context-smoke
node scripts/benchmark-context-model.mjs --run --model YOUR_SELECTED_MODEL --output .local/context-model-run
```

`--run` and the model name are required. The script does not inspect credential files, change the user's configuration, or supply an API key. Each call gets a fresh temporary working directory and ephemeral conversation, with memories, project instructions, host skills and tools disabled. A macOS process sandbox additionally denies reads of the global `AGENTS.md` and `AGENTS.override.md`, including symlink targets. The ordinary project-document limit alone does not suppress global instructions. Other operating systems currently fail before sending a request because this additional isolation guard is not implemented there.

All cases use medium reasoning and the same CLI model defaults. The runner explicitly uses the existing OpenAI sign-in with HTTPS transport; the initial local smoke found repeated WebSocket timeouts before a successful fallback. It does not set a different API endpoint or account. Two calls run concurrently in a deterministic shuffled order. Raw local JSONL events, replies, input hashes, usage and wall-clock duration are retained beside `model-results.json`. CLI output does not expose a provider-resolved model snapshot identifier, so `configuredModel` is recorded and `providerReportedModel` remains null. No actual snapshot ID is inferred.

References for the CLI flags and transport settings: [OpenAI non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), and [instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md). The global-instruction isolation behavior was also verified locally with the CLI's offline prompt renderer before the final model run.

## Recorded model run, 2026-10-01

[Open the visual comparison](../benchmarks/results/2026-10-01/review.html), or inspect the [exact synthetic inputs](../benchmarks/results/2026-10-01/inputs.json), [unabridged replies and usage](../benchmarks/results/2026-10-01/model-results.json), and [mechanical checks](../benchmarks/results/2026-10-01/review.json). The HTML is a standalone local file; GitHub's source viewer does not execute it.

The final isolated run completed all 12 calls with `gpt-6-astra`, medium reasoning, and Codex CLI `0.158.0-alpha.2.1`. The provider-resolved snapshot is unavailable. These are observed choices, not an aggregate quality score:

| Stage | No context | Raw archive | Structured context |
| --- | --- | --- | --- |
| Initial preference | A, asks about missing preferences | A, cycling within budget | A, cycling within budget |
| Confirmed continuing correction | A, asks about missing preferences | B, public transit within budget | B, public transit within budget |
| This-visit cycling exception | A, honors the explicit request | A, retains continuing transit preference | A, retains continuing transit preference |
| New task | D, asks about missing preferences | E, applies the continuing correction | E, applies the continuing correction |

For example, the structured correction reply chooses public transit despite taking 15 minutes longer and costing 12 credits more. Its subsequent new-task reply makes the same preference-sensitive tradeoff with different options. This demonstrates the small fixture's intended sequence; it does not establish general personal understanding. The raw-archive replies also make these choices correctly. No answer-quality advantage over that baseline is established here.

All four structured replies return IDs that resolve to the two supplied confirmed facts. Three raw-archive replies return section headings in `usedContextIds`, and one returns none. The raw archive has no stable fact IDs to cite, so this is a traceability difference, not evidence of wrong decisions. Every raw-archive input includes the deliberately unconfirmed and unrelated canaries; structured inputs exclude both. No reply repeats either canary. The no-context replies appropriately acknowledge missing preferences rather than pretending to know them.

Observed latency ranges from 6.398 to 11.008 seconds, with an 8.124-second median. Total reported usage is 120,491 input tokens (including 36,352 cached input tokens) and 1,542 output tokens. These values include CLI instructions and runtime overhead. Each combination ran once, cache state varied, and two calls ran concurrently; these durations cannot support comparative speed claims. Structured metadata increased input size for this tiny fixture. No independent blind review has been performed.

The local event audit finds no tool calls or unknown item types. All 12 processes report that reading global instructions was denied by the isolation guard. Expected diagnostics for disabled host skills and code-mode tooling are retained as sanitized codes. The initial pilot, which still inherited generic global language guidance, is excluded from this final evidence; its diagnosis and raw event logs remain local.

To rebuild a review from an already completed run, without contacting a model:

```sh
node scripts/review-context-benchmark.mjs PATH_TO_SAVED_RUN
```

The renderer checks all input/output hashes and reply shapes. When local JSONL logs are present, it additionally audits event types. Public evidence intentionally excludes those logs and their local process paths.
