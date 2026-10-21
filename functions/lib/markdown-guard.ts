/**
 * 评论正文的「只许文字」审查。
 *
 * 规则：评论只允许纯文字排版（段落、换行、加粗、斜体、删除线、行内代码、
 * 代码块、引用、列表）。链接、图片、原始 HTML、裸 URL 一律拒绝，
 * 因为它们会把读者带去本站之外，或引入不可控的加载行为。
 *
 * 这一层跑在服务端，是真正的闸门；前端的 DOMPurify 白名单是第二道保险。
 */

export type MarkdownIssue =
  | 'link'
  | 'image'
  | 'raw-html'
  | 'bare-url'
  | 'entity'
  | 'control-char';

export interface MarkdownGuardOptions {
  allowLinks: boolean;
  allowImages: boolean;
  allowHtml: boolean;
}

export interface GuardResult {
  ok: boolean;
  issue?: MarkdownIssue;
  detail?: string;
}

/** 零宽、双向覆盖、控制字符 —— 用来把 URL/词拆开绕过检测，直接拒 */
const CONTROL_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u180E\uFEFF]/;

/** HTML 实体，防 `&#104;ttp://` 这类编码绕过 */
const ENTITY_RE = /&#(?:x[0-9a-f]{1,6}|\d{1,7});/i;

const IMAGE_MD_RE = /!\[[^\]\n]*\]\s*\(/;
const IMAGE_TAG_RE = /<img\b/i;
const DATA_IMAGE_RE = /data:image\//i;

const LINK_INLINE_RE = /\[[^\]\n]*\]\s*\([^)]*\)/;
const LINK_REF_RE = /\[[^\]\n]*\]\s*\[[^\]\n]*\]/;
const LINK_DEF_RE = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S+/m;
const ANCHOR_TAG_RE = /<a\b/i;
const DANGEROUS_SCHEME_RE = /(?:mailto|javascript|vbscript|data):/i;

const BARE_URL_RE = /(?:https?|ftp):\/\//i;
const WWW_RE = /(?:^|[\s(（])www\.[a-z0-9-]+\.[a-z]{2,}/i;

/** Markdown 之外的原生标签也一并识别，用「已知标签名」判断避免误伤 `a<b` 这类代码 */
const KNOWN_HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
  'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img',
  'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu',
  'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p',
  'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script',
  'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub',
  'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th',
  'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr', 'math',
]);

function snippet(text: string, at: number): string {
  return text.slice(at, at + 40).replace(/\s+/g, ' ');
}

function findKnownHtmlTag(text: string): { tag: string; at: number } | null {
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (KNOWN_HTML_TAGS.has(name)) return { tag: match[0], at: match.index };
  }

  return null;
}

/**
 * 审查一段文本（昵称或正文）。
 * opts 中任一开关为 true 时跳过对应类别；控制字符与实体永远拒绝。
 */
export function auditMarkdown(text: string, opts: MarkdownGuardOptions): GuardResult {
  const raw = String(text ?? '');
  if (!raw.trim()) return { ok: true };

  const control = raw.search(CONTROL_CHARS_RE);
  if (control >= 0) {
    return {
      ok: false,
      issue: 'control-char',
      detail: `包含不可见控制字符（位置 ${control}）`,
    };
  }

  const entity = raw.search(ENTITY_RE);
  if (entity >= 0) {
    return { ok: false, issue: 'entity', detail: `包含 HTML 实体编码：${snippet(raw, entity)}` };
  }

  if (!opts.allowImages) {
    for (const re of [IMAGE_MD_RE, IMAGE_TAG_RE, DATA_IMAGE_RE]) {
      const at = raw.search(re);
      if (at >= 0) {
        return { ok: false, issue: 'image', detail: `包含图片：${snippet(raw, at)}` };
      }
    }
  }

  if (!opts.allowLinks) {
    for (const re of [LINK_INLINE_RE, LINK_REF_RE, LINK_DEF_RE, ANCHOR_TAG_RE, DANGEROUS_SCHEME_RE]) {
      const at = raw.search(re);
      if (at >= 0) {
        return { ok: false, issue: 'link', detail: `包含链接：${snippet(raw, at)}` };
      }
    }

    for (const re of [BARE_URL_RE, WWW_RE]) {
      const at = raw.search(re);
      if (at >= 0) {
        return { ok: false, issue: 'bare-url', detail: `包含网址：${snippet(raw, at)}` };
      }
    }
  }

  if (!opts.allowHtml) {
    const comment = raw.search(/<!--|<\?/);
    if (comment >= 0) {
      return { ok: false, issue: 'raw-html', detail: `包含 HTML 注释：${snippet(raw, comment)}` };
    }

    const tag = findKnownHtmlTag(raw);
    if (tag) {
      return { ok: false, issue: 'raw-html', detail: `包含 HTML 标签：${tag.tag}` };
    }
  }

  return { ok: true };
}

/** 给用户看的文案：短、明确、可操作 */
export const ISSUE_MESSAGES: Record<MarkdownIssue, string> = {
  link: '不允许链接',
  image: '不允许图片',
  'raw-html': '不允许 HTML 标签',
  'bare-url': '不允许网址',
  entity: '不允许编码字符',
  'control-char': '包含不可见字符',
};
