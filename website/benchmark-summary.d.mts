import type {Plugin} from 'vite';
export function readBenchmarkSummary(sourceDirectory: string): Promise<unknown>;
export function benchmarkSummaryPlugin(options: {sourceDirectory: string}): Plugin;
