/**
 * 文章 frontmatter 的读写。
 * 使用 yaml 库，避免手写解析在引号、数组、日期上的边界问题。
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface PostData {
  title: string;
  description: string;
  pubDate: string;
  updatedDate?: string;
  tags: string[];
  draft: boolean;
  cover?: string;
}

export interface ParsedPost {
  data: PostData;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** 把 Markdown 文件拆成元数据与正文 */
export function parsePost(raw: string): ParsedPost {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return {
      data: {
        title: '',
        description: '',
        pubDate: '',
        tags: [],
        draft: false,
      },
      body: raw,
    };
  }

  const meta = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;

  return {
    data: {
      title: String(meta.title ?? ''),
      description: String(meta.description ?? ''),
      pubDate: normalizeDate(meta.pubDate),
      updatedDate: meta.updatedDate ? normalizeDate(meta.updatedDate) : undefined,
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      draft: meta.draft === true,
      cover: meta.cover ? String(meta.cover) : undefined,
    },
    body: match[2] ?? '',
  };
}

/** 生成完整的 Markdown 文件内容 */
export function serializePost(data: PostData, body: string): string {
  const meta: Record<string, unknown> = {
    title: data.title,
    description: data.description,
    pubDate: data.pubDate,
    tags: data.tags,
    draft: data.draft,
  };

  if (data.updatedDate) meta.updatedDate = data.updatedDate;
  if (data.cover) meta.cover = data.cover;

  const yaml = stringifyYaml(meta, { lineWidth: 0 }).trimEnd();
  const normalizedBody = body.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');

  return `---\n${yaml}\n---\n\n${normalizedBody}\n`;
}

/** 日期统一成 YYYY-MM-DD */
export function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? '').trim();
  // 已经形如 2026-10-21 或 2026-10-21T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return new Date().toISOString().slice(0, 10);
}
