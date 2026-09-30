// Adapted from Greenroom origin/main e8beec13, with the copyright holder's
// explicit instruction to reuse the composer interaction in Hither.
import type { ClipboardEvent } from 'react';

/** 输入框有文字或附件都可以发送。图片本身就是完整的用户输入，不强迫配一句占位文字。 */
export function canSendComposer(text: string, attachmentCount: number): boolean {
  return text.trim().length > 0 || attachmentCount > 0;
}

/* ============================================================================
   富文本粘贴里的真实链接
   ----------------------------------------------------------------------------
   textarea 原生粘贴只收 text/plain。浏览器从网页复制一条链接时，纯文本往往只有人眼
   看到的短文案，真正 href 则只在 text/html 里。招聘系统尤其常见：三个岗位都显示同一
   个主页地址，岗位 UUID 放在 #/job/... 里；一旦拍平成纯文本，界面看不出链接，助手也
   会把三个岗位误判成同一个。

   这里把剪贴板 HTML 里的 http(s) 锚点收成产品已经支持的 markdown 链接。消息正文仍是
   一段普通字符串，现有 Prose/LinkChip 会恢复绿色可点击展示，模型拿到的则是完整 href。
   脚本、样式、图片等节点一律不读，非 http(s) 协议不变成链接。
   ============================================================================ */

const BLOCK = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "DT",
  "DD",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

function webHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** 一枚 HTML 锚点变成现有正文渲染器能无损识别的 markdown。 */
export function richAnchorMarkdown(labelRaw: string, hrefRaw: string): string | null {
  const href = webHref(hrefRaw);
  if (!href) return null;
  const label = labelRaw.replace(/\s+/g, " ").trim();
  /* 当前轻量 markdown 语法不处理转义括号。碰到会破坏边界的文案或地址时直接保留完整
     裸地址，至少目标不会丢，也仍会被 LinkChip 识别。 */
  if (!label || /[\[\]\n]/.test(label) || /[\s)]/.test(href)) return href;
  return `[${label}](${href})`;
}

/**
 * 从浏览器剪贴板的 text/html 恢复真实链接。没有安全锚点时返回 null，让 textarea
 * 继续走原生纯文本粘贴；因此普通文字、代码片段和 Vue.js 之类裸域名完全不受影响。
 */
export function richClipboardText(html: string): string | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let links = 0;

  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? "";
    if (node.nodeType !== 1) return "";
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") return "";
    if (tag === "BR") return "\n";
    if (tag === "A") {
      const made = richAnchorMarkdown(el.textContent ?? "", el.getAttribute("href") ?? "");
      if (made) {
        links++;
        return made;
      }
    }
    const inside = Array.from(el.childNodes, read).join("");
    return BLOCK.has(tag) ? `${inside}\n` : inside;
  };

  const text = Array.from(doc.body.childNodes, read)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return links && text ? text : null;
}

/** 把恢复后的富文本放回用户当前选区，供主输入框和「修改提问」共用。 */
export function insertComposerText(value: string, inserted: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const text = value.slice(0, from) + inserted + value.slice(to);
  return { text, caret: from + inserted.length };
}

/** Return true only when a rich link was handled; ordinary paste stays native. */
export function pasteComposerLinks(event: ClipboardEvent<HTMLElement>, value: string, onChange: (value:string)=>void): boolean {
  const rich=richClipboardText(event.clipboardData.getData('text/html'));
  if(!rich)return false;
  const target=event.target;
  if(!(target instanceof HTMLTextAreaElement||target instanceof HTMLInputElement))return false;
  event.preventDefault();
  const next=insertComposerText(value,rich,target.selectionStart??value.length,target.selectionEnd??value.length);
  onChange(next.text);
  requestAnimationFrame(()=>{if(target.isConnected){target.focus();target.setSelectionRange(next.caret,next.caret);}});
  return true;
}
