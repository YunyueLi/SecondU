export type BenchmarkText = {
    zh: string;
    en: string;
};
export type BenchmarkMode = {
    id: string;
    title: BenchmarkText;
    description: BenchmarkText;
};
export type BenchmarkCheck = {
    label: BenchmarkText;
    value: BenchmarkText;
    state: 'pass' | 'fail' | 'neutral';
};
export type BenchmarkResult = {
    id: string;
    caseId: string;
    mode: string;
    repetition: number;
    status: string;
    selection: string;
    action: string;
    reason: string;
    clarification: string | null;
    citations: string[];
    output: string;
    context: string;
    system: string;
    latencyMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    inputHash: string;
    outputHash: string;
    checks: BenchmarkCheck[];
    failureExplanation?: BenchmarkText;
    diagnostics?: {code: string; message: string}[];
    citationEvidence?: {id: string; statement: string; status: string; supplied: boolean}[];
};
export type BenchmarkCase = {
    id: string;
    capability: string;
    title: BenchmarkText;
    description: BenchmarkText;
    prompt: string;
    expectation: BenchmarkText;
};
export type BenchmarkComparison = {
    id: string;
    label: BenchmarkText;
    detail: BenchmarkText;
    cells: {
        mode: string;
        text: string;
        numerator?: number;
        denominator?: number;
        note?: BenchmarkText;
        state?: 'pass' | 'fail' | 'neutral';
    }[];
};
export type BenchmarkDataset = {
    version: string;
    directory: string;
    model: string;
    snapshot: string | null;
    effort: string;
    cases: BenchmarkCase[];
    modes: BenchmarkMode[];
    results: BenchmarkResult[];
    completed: number;
    planned: number;
    repetitions: number;
    finishedAt: string;
    comparisons: BenchmarkComparison[];
    comparisonModes?: string[];
    capabilities?: {id: string; title: BenchmarkText; comparisons: BenchmarkComparison[]}[];
    paired?: {cases: number; categories: {id: string; label: BenchmarkText; count: number}[]; rows: {caseId: string; category: string}[]};
    calibration?: BenchmarkText;
    findings: {
        title: BenchmarkText;
        text: BenchmarkText;
    }[];
    limitations: BenchmarkText[];
    inputHash: string;
    resultsHash: string;
};
const text = (zh: string, en: string): BenchmarkText => ({ zh, en });
const modes: BenchmarkMode[] = [
    { id: 'no_context', title: text('无个人上下文', 'No personal context'), description: text('只提供当前任务。缺少偏好时，允许提出澄清。', 'Only the current task. Asking about a missing preference is valid.') },
    { id: 'raw_archive', title: text('原始资料', 'Raw archive'), description: text('提供原始文本，保留旧偏好、纠正与未确认内容。', 'Original text, including older preferences, corrections and unconfirmed material.') },
    { id: 'structured', title: text('SecondU 上下文', 'SecondU context'), description: text('选择当前已确认事实，并保留可解析的来源标识。', 'Current confirmed facts, with references that resolve to the supplied evidence.') },
];
const caseCopy: Record<string, {
    title: BenchmarkText;
    description: BenchmarkText;
    expectation: BenchmarkText;
}> = {
    initial_tradeoff: { title: text('最初的偏好', 'Initial preference'), description: text('骑行在 30 分钟内优先，总花费不超过 40。', 'Prefer cycling within 30 minutes; spend no more than 40 credits.'), expectation: text('有已确认背景时：A。无背景时可询问偏好。', 'With confirmed context: A. Without context, asking about preferences is valid.') },
    confirmed_correction: { title: text('确认后的纠正', 'Confirmed correction'), description: text('长期偏好已改为公共交通，即使骑行更快。', 'The continuing preference now favors public transit, even when cycling is faster.'), expectation: text('有已确认背景时：B。旧的骑行偏好应被替代。', 'With confirmed context: B. The previous cycling preference is superseded.') },
    one_time_exception: { title: text('仅这一次的例外', 'One-time exception'), description: text('这次明确要测试借来的自行车；长期偏好仍是公共交通。', 'Try a borrowed bicycle for this visit; keep the continuing transit preference.'), expectation: text('本次任务：A。不能把一次例外当作新的长期偏好。', 'For this task: A. A one-time exception must not become a continuing preference.') },
    new_task_transfer: { title: text('带到下一件事', 'Transfer to a new task'), description: text('换一组地点与价格，检查纠正能否延续。', 'A different set of places and prices tests whether the correction carries forward.'), expectation: text('有已确认背景时：E。上次骑行例外不应影响新任务。', 'With confirmed context: E. The previous cycling exception does not apply.') },
};
// Only the explicitly public synthetic evidence is imported; no local run logs.
export async function loadBenchmark(): Promise<BenchmarkDataset> {
    const newer = import.meta.glob("../../benchmarks/results/2026-10-01-v2/{inputs,review}.json", {import: "default"});
    const inputKey = "../../benchmarks/results/2026-10-01-v2/inputs.json";
    const reviewKey = "../../benchmarks/results/2026-10-01-v2/review.json";
    if (newer[inputKey] && newer[reviewKey]) {
        const [inputs, review, adapter] = await Promise.all([newer[inputKey](), newer[reviewKey](), import("./benchmark-v2")]);
        return adapter.adaptBenchmarkV2(inputs, review);
    }
    const [inputs, results, review] = await Promise.all([
        import('../../benchmarks/results/2026-10-01/inputs.json').then(m => m.default),
        import('../../benchmarks/results/2026-10-01/model-results.json').then(m => m.default),
        import('../../benchmarks/results/2026-10-01/review.json').then(m => m.default),
    ]);
    const cases = inputs.cases.map(item => ({ id: item.id, capability: item.id, ...caseCopy[item.id], prompt: item.prompt }));
    return {
        version: 'v1', directory: '2026-10-01', model: results.configuredModel, snapshot: results.providerReportedModel, effort: results.reasoningEffort,
        cases, modes, completed: results.summary.completed, planned: results.summary.total, repetitions: 1, finishedAt: results.finishedAt,
        inputHash: review.evidence.inputsSha256, resultsHash: review.evidence.resultsSha256,
        results: review.rows.map(row => {
            const source = results.outputs.find(output => output.id === `${row.caseId}-${row.mode}`)!;
            const item = inputs.cases.find(item => item.id === row.caseId)!;
            const input = item.inputs.find(input => input.mode === row.mode)!;
            return { id: source.id, caseId: row.caseId, mode: row.mode, repetition: 1, status: source.status,
                selection: source.parsedOutput.choice ?? '', action: '', reason: source.parsedOutput.reason, clarification: source.parsedOutput.clarification,
                citations: source.parsedOutput.usedContextIds, output: source.output, context: input.context, system: input.system,
                latencyMs: source.latencyMs, inputTokens: source.usage.input_tokens, outputTokens: source.usage.output_tokens,
                inputHash: source.inputSha256, outputHash: source.outputSha256,
                checks: [
                    { label: text('事实引用', 'Fact references'), value: row.structuredIdsValid === true ? text('全部可解析', 'All resolve') : text('不适用', 'Not applicable'), state: row.structuredIdsValid === true ? 'pass' : 'neutral' },
                    { label: text('输出测试标记', 'Output canary'), value: row.outputCanaryRepeated ? text('重复出现', 'Repeated') : text('未重复', 'Not repeated'), state: row.outputCanaryRepeated ? 'fail' : 'pass' },
                    { label: text('输入包含未确认内容', 'Unconfirmed input'), value: row.inputExposure.candidateCanaryExposed ? text('包含', 'Included') : text('未包含', 'Excluded'), state: row.inputExposure.candidateCanaryExposed ? 'neutral' : 'pass' },
                ],
            };
        }),
        comparisons: cases.map(item => ({ id: item.id, label: item.title, detail: item.description, cells: modes.map(mode => {
                const row = review.rows.find(row => row.caseId === item.id && row.mode === mode.id)!;
                return { mode: mode.id, text: row.choice, note: mode.id === 'no_context' ? text('允许澄清偏好', 'May ask about preferences') : text('实际观察到的选择', 'Observed choice') };
            }) })),
        findings: [
            { title: text('这组选择，两个有背景的条件都做对了。', 'Both context conditions made the expected choices.'), text: text('原始资料与 SecondU 上下文都沿用了已确认的纠正。这个小样本尚未证明回答质量优势。', 'Raw text and SecondU context both followed the confirmed correction. This small run does not establish an answer-quality advantage.') },
            { title: text('差异在于进入模型的内容与可追溯性。', 'The difference is input exposure and traceability.'), text: text('四次结构化回复均引用了可解析事实；其输入排除了未确认和无关测试标记。任何条件的输出都没有重复这些标记。', 'All four structured replies cited resolvable facts. Their inputs excluded the unconfirmed and unrelated canaries; no condition repeated a canary in its output.') },
        ],
        limitations: [text('历史基线：4 个合成场景 × 3 种条件，各运行 1 次。', 'Historical baseline: four synthetic cases × three conditions, run once each.'), text('单模型，无独立盲评；输入大小、缓存和并发不同，不能据此比较速度或 token 效率。', 'One model, no independent blind review. Input size, cache and concurrency prevent comparative speed or token-efficiency claims.'), text('选择正确与引用有效是分开的检查；不提供综合质量分。', 'Choice and reference validity are separate checks. There is no aggregate quality score.')],
    };
}
