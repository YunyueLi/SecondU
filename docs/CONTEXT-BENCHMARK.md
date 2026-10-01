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

[Open the interactive online benchmark](https://yunyueli.github.io/SecondU/benchmark/?lang=en), view the [standalone historical comparison](https://yunyueli.github.io/SecondU/benchmark/2026-10-01/review.html), or inspect the [exact synthetic inputs](../benchmarks/results/2026-10-01/inputs.json), [unabridged replies and usage](../benchmarks/results/2026-10-01/model-results.json), and [mechanical checks](../benchmarks/results/2026-10-01/review.json). The [original HTML](../benchmarks/results/2026-10-01/review.html) remains available as a standalone local file. The online presentation uses the same saved public evidence; it does not run new model calls.

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

## Version 2: frozen synthetic decision suite

Version 2 expands the illustrative run into 24 authored scenarios across six capability groups: preference tradeoffs, joint constraint planning, continuing corrections and task-local exceptions, missing/conflicting evidence, person/task scope, and candidate/noise handling. It uses 23 fictional subject labels, including one paired exception/transfer subject. Four separate development scenarios form a 12-call pilot; they are excluded from the formal results. The formal plan contains three conditions and two repetitions per scenario, for 144 planned calls. These are 24 authored scenario units, not 144 independent people or an industry intelligence benchmark.

The exact formal inputs, evaluator-only reference criteria and trial order are frozen before formal generation. A fixed case-index option rotation reduces a single preferred letter's position advantage; all conditions and repeats of a scenario receive identical options and labels. Six condition-order permutations are balanced over the formal scenario/repetition blocks, then ordered by a published deterministic hash seed. The source, runner and scorer file hashes are retained with the plan. Reference answers and required-evidence sets never enter the model prompt.

After the separate development pilot and before the first formal request, the hard-constraint metric was clarified: soft-preference and expected-clarification cases are not applicable, every planned applicable trial stays in its denominator, and the taxi-only task exception is a hard requirement. The amendment records both earlier hashes and the final freeze. All 72 distinct formal model inputs remained byte-identical; the original pilot inputs, plan, replies and review are preserved unchanged. Pilot metric totals therefore describe the earlier scorer and are not pooled with the formal result.

### Conditions and budgets

- **No personal context** uses the production disabled-context result. Its oracle is based only on information visible in the current task: a specific clarification is correct when personal information was withheld, while the self-contained control tasks should be answered directly. This is a calibration control, not a third entry in a memory-quality ranking.
- **Raw retrieval** uses BM25 (`k1=1.2`, `b=0.75`) over the same eligible source events. Only the task contributes query terms. Complete owner/field event chains retain original statements, corrections, withdrawals and one-time status. Groups are admitted within the budget without splitting their source documents; ties use stable source IDs, and presentation returns to chronological order. No evaluator reference is consulted.
- **Structured context with evidence** uses the unmodified production memory preview, explicit review/confirmation, revision, `personalContextFor`, and `evidenceFor` functions. The benchmark supplies authored confirmation decisions; it does not measure automatic extraction or prove that the product can infer correct personal facts without review. Current revisions cite the actual supporting correction source. Both conditions use the same source-ID namespace.

Each context has the same maximum of **8,000 UTF-16 characters**, including serialized context metadata. This is an upper bound, not equal-length padding or an exact token budget. Structured retrieval retains the production allocation between records and evidence; total serialized context is checked against the common ceiling. Provider-reported input/output/cache token usage is recorded separately and includes the CLI's common instructions. The same configured model (`gpt-6-astra`), medium reasoning, response schema, answer-length instruction, and CLI default output limit apply to every trial. The provider may not return a concrete model snapshot; when absent it remains null.

The shared fixture layer replays only events at or before `questionAt`, using the event timestamp as the synthetic clock while invoking the production functions. This prevents future evidence from entering either condition. It is a harness point-in-time snapshot, **not** a claim that setting `at` on the production selector reconstructs historical fact versions.

### Metrics and failures

The primary paired comparison is raw retrieval versus structured context on the same scenario oracle. Each scenario counts as stable-correct only if both repetitions are correct; wins, losses and ties are reported across the 24 authored scenarios. Two repetitions are a stability check, not additional independent samples. No significance claim is made from treating 48 replies per condition as 48 independent cases.

Metrics remain separate:

- Exact action/selection correctness, with ordered selections preserved for the prerequisite task. Clarifications must identify the exact prespecified missing/conflicting fields; unknown, duplicate or already-known fields do not receive credit.
- Hard-constraint feasibility with applicability fixed before generation: when a task requires a choice under hard constraints, every planned trial counts. A missing reply, timeout, malformed JSON or failure to choose counts as failure. Pure soft-preference tasks and tasks whose correct action is clarification are not applicable.
- Required-source coverage, input evidence availability, invalid source references, and citations of candidates or superseded records. Real source IDs alone do not establish semantic support or correct reasoning; raw explanations remain available for inspection.
- Literal synthetic-canary repetition in outputs, distinguished from canary exposure in inputs. These measurements are not a general privacy or prompt-injection guarantee.
- Transport completion, JSON/schema validity, latency, and provider usage. These are not interchangeable with task correctness.

If retrieval omits a necessary fact, asking for it may be appropriate given the actual input, but the memory condition still fails its end-to-end decision objective. The evaluator reports the retrieval miss and the appropriate clarification separately; it does not rewrite the oracle to turn missing context into success. No-context alone receives its deliberately different visible-information oracle.

The plan fixes every case, condition, repetition and attempt ID. Missing, duplicate, malformed, timed-out and unsuccessful replies remain visible. Application-level automatic retries and schema repair are disabled; CLI-internal transport behavior may still produce diagnostic messages. A tool event invalidates the run. Each call uses a fresh ephemeral session and temporary directory, disables tools, memories, host skills and project instructions, ignores user configuration, and applies the existing macOS global-instruction read guard. The script uses an existing CLI login without reading credential files or supplying a key. Public diagnostics redact local machine paths; private raw process logs remain local with hashes.

### Reproduction commands

The `--output` destination must be new: inputs and plans are not silently replaced. The pilot and formal datasets are separate.

```sh
node scripts/benchmark-context-v2.mjs --pilot --output .local/context-v2-pilot
node scripts/benchmark-context-v2-model.mjs --run --model gpt-6-astra --input .local/context-v2-pilot/inputs.json --output .local/context-v2-pilot
node scripts/review-context-benchmark-v2.mjs .local/context-v2-pilot

node scripts/benchmark-context-v2.mjs --output .local/context-v2-formal
node scripts/benchmark-context-v2-model.mjs --prepare --model gpt-6-astra --input .local/context-v2-formal/inputs.json --output .local/context-v2-formal
# Inspect the frozen plan and pilot before authorizing real formal generation.
node scripts/benchmark-context-v2-model.mjs --run --model gpt-6-astra --input .local/context-v2-formal/inputs.json --output .local/context-v2-formal
node scripts/review-context-benchmark-v2.mjs .local/context-v2-formal
node --test tests/context-benchmark.test.mjs tests/context-benchmark-v2.test.mjs
```

The original 12-call record remains unchanged. New results are published under a separate `2026-10-01-v2` directory after actual generation and evidence review; an input fixture or prepared plan alone is not a completed model evaluation.

### Recorded version 2 run, 2026-10-01

The formal run started at 14:14:28 UTC and ended at 14:37:43 UTC. All **144 planned attempts** were recorded: 143 returned a reply and one reached the fixed 180-second timeout. There were 144 distinct session hashes, 144 blocked global-instruction reads, no tool events, and no missing, duplicate or unexpected trial IDs. All 123 offline checks passed, all evidence hashes matched, and the ten frozen source/runner/scorer files remained unchanged through completion.

Inspect the [frozen inputs and reference criteria](../benchmarks/results/2026-10-01-v2/inputs.json), [144-attempt plan](../benchmarks/results/2026-10-01-v2/plan.json), [unabridged replies, usage and diagnostics](../benchmarks/results/2026-10-01-v2/model-results.json), and [complete scored review](../benchmarks/results/2026-10-01-v2/review.json). The separate [pilot inputs](../benchmarks/results/2026-10-01-v2/pilot/inputs.json), [pilot plan](../benchmarks/results/2026-10-01-v2/pilot/plan.json), [pilot replies](../benchmarks/results/2026-10-01-v2/pilot/model-results.json), and [original pilot review](../benchmarks/results/2026-10-01-v2/pilot/review.json) are retained without modification. `review.json` is the final evaluation; the model capture's original `reviewStatus: "pending"` records its state before that separate review was generated.

| Formal memory comparison | BM25 raw retrieval | Structured context |
| --- | ---: | ---: |
| Correct decisions, all planned trials | 48/48 | 43/48 |
| Scenarios correct in both repetitions | 24/24 | 21/24 |
| Hard constraints satisfied, applicable trials | 36/36 | 32/36 |
| Required evidence fully cited, applicable trials | 40/40 | 36/40 |
| Cited IDs present in the supplied context | 84/84 | 74/74 |
| Inputs containing candidate or task-local sources | 10/48 | 0/48 |
| Inputs containing unrelated canaries | 4/48 | 4/48 |
| Replies repeating a canary | 0/48 | 0/48 |

The paired scenario result is **21 correct for both, three correct only for raw retrieval, zero correct only for structured context, and zero failed by both**. This run does not establish a structured-context quality advantage. The three raw-only scenarios have different causes:

- **`h03` and `h04`: retrieval misses in both repetitions.** The production structured selector omitted the required day/studio preference while retaining the budget and unrelated notes under its character allocation. The model correctly noticed that its supplied evidence was incomplete and asked for the missing preference. That was appropriate given the input, but still failed the end-to-end decision objective. BM25 retrieved the needed evidence and answered correctly.
- **`r04`: one transport timeout.** The second structured attempt reached 180 seconds without a reply; the first answered correctly. The failed attempt remains in the decision and repeat-success denominators. This self-contained soft-objective task has no applicable hard-constraint denominator. A single network/runtime failure does not demonstrate inferior memory reasoning.

The no-context calibration scored **47/48 trials and 23/24 stable-correct scenarios** using its separate visible-information oracle. Its second `l04` response asked for the missing historical budget but ended with an incomplete JSON string. The strict schema check failed; the captured response was neither repaired nor retried. It is not compared with the memory conditions as if all three had received the same information.

Raw retrieval's four candidate-source citations are not four observed reasoning errors: both `u03` replies cite the tentative availability while explicitly refusing to treat it as confirmed, and both `l03` replies cite the one-time exception while explicitly limiting its scope. No reply cites an absent or superseded source. Source-presence metrics still cannot establish that every sentence is semantically supported, and no independent blind semantic review is claimed.

Reported usage across the **143 measured calls** totals 1,500,256 input tokens, including 1,004,160 cached input tokens, and 14,228 output tokens. Usage for the timed-out call is unavailable, not zero. Median supplied context length is 983 characters for raw retrieval and 2,065.5 for structured context; this run provides no token-saving claim. Across all attempts, observed wall-clock latency ranges from 6.278 to 180.014 seconds, with a 12.5875-second median. Model-catalog refresh timeout diagnostics occurred in 103 calls, including calls that subsequently returned normally. Cache state, CLI overhead and concurrent execution prevent a comparative speed conclusion.

These results describe one configured model on an authored synthetic suite. They identify concrete retrieval and response-reliability gaps to investigate; they do not establish broad real-world intelligence, automatic fact-extraction accuracy, or performance on private personal histories.
