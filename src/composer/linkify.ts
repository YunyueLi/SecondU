// Adapted from Greenroom origin/main e8beec13 at the copyright holder's request.
/* ============================================================================
   正文里的网址
   ----------------------------------------------------------------------------
   对话正文原来把网址当普通文字排。一条岗位地址贴进来就是一长串灰字，点不了、
   看不出是哪个站，人只能自己选中复制。这里把它认出来，交给 LinkChip 排成可点的
   链接。

   只认四种，都是这个产品里真会出现的：
   · https?:// 开头的地址；
   · www. 开头的地址（不带协议贴过来的那种）；
   · 域名后明确带路径的地址（app.mokahr.com/apply/... 这种）；
   · 邮箱（JD 和面试通知里的 HR 邮箱）。

   **只有域名、没有路径的裸文本仍然一律不认。** 试过放开，代价立刻现出来：
   「React 和 Vue.js 都可以」里的 Vue.js、正文里的 index.html、缩写里的 a.m. 全变成
   链接。要求域名后至少有一段 `/path`，既接住用户真会复制的招聘链接，也不会把
   文档名和技术名词变成链接。

   两条踩过的坑，都写在实现旁边：中日韩标点必须排除在地址字符集之外（不能靠事后
   削尾），以及**芯片上的文案必须取解析后的主机名，不能用原文**。
   ============================================================================ */

/** 一处链接在原文里的位置与它该显示成什么 */
export interface Link {
  start: number;
  end: number;
  /** 真正要跳的地址。www. 那种补上 https，邮箱补上 mailto */
  href: string;
  /** 芯片上显示的文案 */
  label: string;
  /** 取图用的主机名。邮箱没有 */
  host: string;
  kind: "url" | "mail";
  /**
   * 这个地址在伪装。两种情形：主机名里混了非拉丁字母（西里尔的 а 冒充拉丁的 a），
   * 或者原文里用 user@host 把真实主机藏在后面（https://github.com@evil.com）。
   * 命中的一律不显示站点图标，并且把 punycode 后的主机名摆出来——**错的图标比
   * 没有图标更糟**，伪装地址配上一个真图标就是帮着骗人。
   */
  suspicious: boolean;
}

/* 地址字符集：把中日韩标点直接排除掉。
   靠事后削尾是不行的——「…abc.html。投了没？」削掉结尾的「？」之后停在「没」，
   句号连着后半句一起被吃进地址。
     U+3000–303F  、。〈〉《》「」『』【】
     U+FF01–FF65  全角！？，；：（）与全角字母数字
     U+2018–201D  ‘’“” */
const NOT_URL = "\\s<>\"'`\\u3000-\\u303f\\uff01-\\uff65\\u2018-\\u201d";
const URL_PART = `[^${NOT_URL}]+`;

/* 四种一起扫，位置最靠前的先匹配。半角标点留给 trimTail 削。
   每次调用现建一个：带 g 的正则把 lastIndex 存在自己身上，共用一个常量的话嵌套或
   并发调用会互相踩掉游标。 */
const linkRe = () =>
  new RegExp(
    `\\bhttps?:\\/\\/${URL_PART}` +
      `|\\bwww\\.${URL_PART}` +
      `|\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}\\/${URL_PART}` +
      `|\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+\\b`,
    "g"
  );

/** markdown 写法。存档里的逐轮复盘是人写的 markdown，里面本来就有这种链接。 */
const mdRe = () => /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** 句末的半角标点不是地址的一部分 */
const TAIL = /[.,;:!?*_~]+$/;

function trimTail(raw: string): string {
  let out = raw.replace(TAIL, "");
  /* 右括号可能是地址自己的（维基那种 /wiki/Foo_(bar)）。只有在右括号多于左括号时
     才当它是中文行文里的收尾括号削掉。 */
  while (out.endsWith(")") && (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)) {
    out = out.slice(0, -1).replace(TAIL, "");
  }
  return out;
}

/** 显示用主机名。去掉 www.，其余原样（已经是 punycode） */
function bareHost(host: string): string {
  return host.replace(/^www\./i, "");
}

/** 路径部分留多少字。主机名永远完整显示，只截路径——截掉的部分在 title 里看得到。 */
const PATH_MAX = 28;

/**
 * 文案。查询串一律不显示：招聘系统的地址后面挂着 gh_src、utm_source 一长串，
 * 那些字对人没有意义，只会把一行挤满。
 */
function labelOf(url: URL): string {
  const host = bareHost(url.hostname);
  const path = decodeSafe(url.pathname).replace(/\/$/, "");
  if (!path || path === "/") return host;
  const short = path.length > PATH_MAX ? `${path.slice(0, PATH_MAX - 1)}…` : path;
  return `${host}${short}`;
}

/** 中文路径按原样显示比一串 %E5%89 好读。解不开就用原文。 */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    /* 不合法的百分号编码：原样显示，界面照旧可读 */
    return s;
  }
}

/**
 * 一个地址的主机名，给「来源」这类标签用。认不出返回空串。
 *
 * 人贴地址时常常不写协议（careers.tencent.com/xxx）。`new URL()` 对这种直接抛
 * TypeError——建档流程里就因此断在半路，只判了「输入框非空」并不够。缺协议按 https
 * 补齐，补完仍不合法就返回空串，让调用方用自己的兜底文案。
 */
export function hostLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`).hostname.replace(/^www\./, "");
  } catch {
    /* 不是个地址：调用方回落到「自己添加」这类说法 */
    return "";
  }
}

/**
 * 用户输入的网页地址统一成可打开的 HTTP(S) URL。
 *
 * 招聘页很常见的复制结果是 `app.mokahr.com/apply/...`，少了协议不代表它不是
 * 链接。这个函数同时给正文链接和岗位导入用，避免两个入口再出现不同口径。
 */
export function normalizeHttpUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** 主机名里有没有非拉丁字母。有就是同形异义伪装的嫌疑。 */
function nonAscii(s: string): boolean {
  return /[^\u0000-\u007f]/.test(s);
}

/**
 * 从合法的 mailto 链接里只取邮箱地址。
 *
 * `subject` / `body` 属于链接动作，不属于简历里的结构化邮箱字段；因此识别字段时
 * 只返回 `?` / `#` 前的地址，但真正渲染链接仍保留原参数。这里不用 URL：不同运行时
 * 对 mailto 的 pathname/query 处理有差异，这份小解析在浏览器、Node 与旧 WebView
 * 上必须得到同一个结果。
 */
export function mailtoAddress(raw: string): string | null {
  if (!/^mailto:/i.test(raw)) return null;
  const target = raw.slice(7).trim();
  const cut = target.search(/[?#]/);
  const address = (cut >= 0 ? target.slice(0, cut) : target).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address) ? address : null;
}

/**
 * 一个地址字符串该变成什么。位置由调用方填。
 * 认不出（协议不对、解析不了）返回 null，调用方当普通文字处理。
 */
function one(raw: string): Omit<Link, "start" | "end"> | null {
  if (/^mailto:/i.test(raw)) {
    const target = raw.slice(7).trim();
    const address = mailtoAddress(raw);
    if (!address) return null;
    const suffix = target.slice(address.length);
    return { href: `mailto:${address}${suffix}`, label: address, host: "", kind: "mail", suspicious: false };
  }
  if (raw.includes("@") && !/^https?:\/\//i.test(raw) && !/^www\./i.test(raw)) {
    return { href: `mailto:${raw}`, label: raw, host: "", kind: "mail", suspicious: false };
  }
  const href = normalizeHttpUrl(raw);
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    /* 认出来了但解析不了（端口写错、方括号不配对一类）：当普通文字排 */
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  /* 原文里主机名那一段。new URL 会把它转成 punycode，两边比对就看得出伪装。 */
  const rawHost = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  const suspicious = nonAscii(rawHost) || rawHost.includes("@");
  return {
    href: url.href,
    label: suspicious ? bareHost(url.hostname) : labelOf(url),
    host: url.hostname,
    kind: "url",
    suspicious,
  };
}

/** Explicit markdown hrefs must already use a supported scheme. */
export function linkFromHref(href:string): Omit<Link,'start'|'end'>|null {
  return /^(?:https?:\/\/|mailto:)/i.test(href)?one(href):null;
}

/** 一段纯文字里的裸地址与邮箱 */
function scan(text: string, incomplete: boolean, at: number): Link[] {
  const out: Link[] = [];
  const re = linkRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = trimTail(m[0]);
    if (!raw) continue;
    const end = m.index + raw.length;
    /* 削掉的尾巴要还给正则，否则下一处从被削的位置之后开始找 */
    re.lastIndex = end;
    if (incomplete && end === text.length) continue;
    const l = one(raw);
    if (l) out.push({ ...l, start: at + m.index, end: at + end });
  }
  return out;
}

/**
 * 找出正文里的所有链接。
 *
 * markdown 写法先切出来，剩下的空档再扫裸地址。反过来不行：先扫裸地址会把
 * `[说明](https://a.com)` 里的地址单独认出来，方括号那半截留在正文里。
 *
 * incomplete 为真时，**贴着文末的那一处不算链接**。流式输出时最后几个字符还在长，
 * 「https://exa」会先闪成一个链接再变成别的，一句话里跳两次。等它长完再认。
 */
export function findLinks(text: string, incomplete = false): Link[] {
  const out: Link[] = [];
  const md = mdRe();
  let m: RegExpExecArray | null;
  let cut = 0;
  while ((m = md.exec(text))) {
    const inner = one(m[2]);
    /* 括号里不是个能认的地址：整段当普通文字，下面扫裸地址时自然会带过去 */
    if (!inner) continue;
    out.push(...scan(text.slice(cut, m.index), false, cut));
    /* 文案用方括号里那句人话，不用地址 */
    out.push({ ...inner, start: m.index, end: m.index + m[0].length, label: m[1] });
    cut = m.index + m[0].length;
  }
  out.push(...scan(text.slice(cut), incomplete, cut));
  return out;
}
