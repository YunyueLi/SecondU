// Adapted from ZCode, zai-org/ZCode @ 3c5b227649371507ddc4eb46ac5133afe6db1cab.
// SPDX-License-Identifier: Apache-2.0
// Source: packages/ui/src/components/workflow-timeline/timeline-bands.ts
// Changes: retain only pure parallel-band folding, track lookup and arc lane allocation.
/**
 * 带与轨道。
 *
 * 分析器报的 `alongside` 是**节点事实**：进入这一阶段时，还没 join 的其他阶段的 strand 仍在跑。
 * 这里把它折成画面上的**带**——声明序上连续的一段阶段，内部拆成若干**轨道**，轨道 0 是主线
 * （最下面那一行），分支轨道叠在它上面。带之前分叉、之后汇合；弧把整条带当**一个节点**。
 *
 * 只有下标，没有 id、没有墨迹、没有像素：时间线模型与侧栏的迷你运行线共用同一套折叠，后者只有
 * `phaseNames` 的下标空间，没有 display 图。
 */

/**
 * 一条阶段流（docs/dynamic-workflow/presentation.md「Streams」）：`from` 站在两者都在跑时把东西交给
 * `to` 站。只有下标，与 `alongside` 同一个下标空间。
 */
export interface StreamSpec {
  from: number;
  to: number;
}

/** 一条带：闭区间 `[from, to]` 上的所有站；`tracks[0]` 是主线。 */
export interface PhaseBand {
  from: number;
  to: number;
  tracks: number[][];
}

/**
 * 折带。`alongside[i]` = 与第 i 站并行的站的下标（越界、自指与未列出的都当没说）。
 *
 * 1. 对称化：`alongside` 只有后来者才报得出（进入 B 时 A 还在跑，A 的载荷里没有 B），画面上
 *    两站是对等的。
 * 2. `~` 的连通分量里成员 ≥ 2 的给出区间 `[min, max]`；相交的区间并起来；区间内的空档也算成员
 *    （鲁棒起见——没有循环时不会出现）。
 * 3. 轨道是区间图的贪心着色，按**声明序**：每个成员落到「道上没有与它并行的成员」的最低一道，
 *    否则另开一道。第一个成员因此总在轨道 0 上。
 * 4. 有流时（`streams`），着色只把「谁也够不着谁」的两站当并行：一个阶段与它下游的每个阶段是
 *    同一条线上的活，跑得再同时也该在一条轨道上。所有成员都落在一条轨道上的带**解散**——它不是
 *    带，站回到主线上，由流轨连起来（spec「Bands and tracks」）。侧栏的迷你运行线不传流。
 */
export function foldPhaseBands(
  count: number,
  alongside: readonly (readonly number[])[],
  streams: readonly StreamSpec[] = [],
): PhaseBand[] {
  const near = Array.from({ length: Math.max(0, count) }, () => new Set<number>());
  for (let i = 0; i < near.length; i += 1) {
    for (const j of alongside[i] ?? []) {
      if (!Number.isInteger(j) || j < 0 || j >= near.length || j === i) continue;
      near[i]!.add(j);
      near[j]!.add(i);
    }
  }

  const seen = Array.from({ length: near.length }, () => false);
  const spans: { from: number; to: number }[] = [];
  for (let root = 0; root < near.length; root += 1) {
    if (seen[root] === true || near[root]!.size === 0) continue;
    let from = root;
    let to = root;
    const stack = [root];
    seen[root] = true;
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (i < from) from = i;
      if (i > to) to = i;
      for (const j of near[i]!) {
        if (seen[j] === true) continue;
        seen[j] = true;
        stack.push(j);
      }
    }
    spans.push({ from, to });
  }

  spans.sort((left, right) => left.from - right.from);
  const merged: { from: number; to: number }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }

  const reach = streamReach(near.length, streams);
  const apart = (i: number, j: number): boolean =>
    near[i]!.has(j) && !reach[i]!.has(j) && !reach[j]!.has(i);
  return merged.flatMap((span) => {
    const tracks: number[][] = [];
    for (let i = span.from; i <= span.to; i += 1) {
      const free = tracks.find((members) => !members.some((member) => apart(i, member)));
      if (free === undefined) tracks.push([i]);
      else free.push(i);
    }
    return tracks.length > 1 ? [{ from: span.from, to: span.to, tracks }] : [];
  });
}

/** 沿流可达：`reach[i]` = 从第 i 站顺着流走得到的站（越界与自指的流当没说）。 */
function streamReach(count: number, streams: readonly StreamSpec[]): Set<number>[] {
  const next = Array.from({ length: count }, () => [] as number[]);
  for (const stream of streams) {
    if (!inRange(stream.from, count) || !inRange(stream.to, count)) continue;
    if (stream.from !== stream.to) next[stream.from]!.push(stream.to);
  }
  return next.map((_, start) => {
    const reached = new Set<number>();
    const stack = [...next[start]!];
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (reached.has(i)) continue;
      reached.add(i);
      stack.push(...next[i]!);
    }
    return reached;
  });
}

const inRange = (i: number, count: number): boolean => Number.isInteger(i) && i >= 0 && i < count;

/** 第 i 站所在的带；带外 undefined。 */
export function bandOf<T extends PhaseBand>(bands: readonly T[], i: number): T | undefined {
  return bands.find((band) => band.from <= i && i <= band.to);
}

/** 第 i 站所在的轨道；带外一律 0（主线）。 */
export function trackOf(bands: readonly PhaseBand[], i: number): number {
  const track = bandOf(bands, i)?.tracks.findIndex((members) => members.includes(i));
  return track === undefined || track < 0 ? 0 : track;
}

/** 弧道的数量（最高的车道 + 1）；渲染层据它给弧留高度。 */
export function arcLaneCount(arcs: readonly { lane: number }[]): number {
  return arcs.reduce((max, arc) => Math.max(max, arc.lane + 1), 0);
}

/**
 * 弧的分道：区间图的贪心着色。弧按跨度从短到长（同跨度保持载荷序）依次落到**最低的空道**上——
 * 「空」= 该道上已有的弧与它在站的索引上**不相交**（闭区间：连共用一个端点的也算相交，因为两条弧
 * 在同一站的竖段会连成一线）。于是：互不相干的弧同一高度；嵌套的弧里面矮外面高（短的先落，长的
 * 只能往上）；只有真正交叉的弧才被推上去。
 *
 * 之前的写法是「第 k 条弧就是第 k 道」：两条各在一头、彼此无关的回边也一高一矮，读者会去找那个
 * 并不存在的理由。
 */
export function assignArcLanes(
  pairs: readonly { from: number; to: number }[],
): { from: number; to: number; lane: number }[] {
  const placed: { lo: number; hi: number; lane: number }[] = [];
  return pairs.map((pair) => {
    const lo = Math.min(pair.from, pair.to);
    const hi = Math.max(pair.from, pair.to);
    const taken = new Set(
      placed
        .filter((other) => Math.max(lo, other.lo) <= Math.min(hi, other.hi))
        .map((other) => other.lane),
    );
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    placed.push({ hi, lane, lo });
    return { from: pair.from, lane, to: pair.to };
  });
}
