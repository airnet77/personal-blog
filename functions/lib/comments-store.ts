/**
 * 评论存储层。
 * 数据以 JSON 文件形式存放在仓库的 comments/ 目录，每篇文章一个文件。
 * 通过 GitHub Contents API 读写，冲突时重试合并。
 */
import type { Env } from './github';

export interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  pinned: boolean;
  hidden: boolean;
}

export interface CommentsFile {
  slug: string;
  comments: Comment[];
}

const DIR = 'comments';
const MAX_COMMENTS = 500;
const MAX_AUTHOR = 30;
const MAX_CONTENT = 2000;

const API = 'https://api.github.com';

class ConflictError extends Error {
  constructor() {
    super('conflict');
  }
}

function headers(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'airnet-blog-comments',
  };
}

function b64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function newId(): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `c_${Date.now()}_${rand}`;
}

function emptyFile(slug: string): CommentsFile {
  return { slug, comments: [] };
}

/** 读取某篇文章的评论文件。文件不存在时返回 null 与 null */
export async function readComments(
  env: Env,
  slug: string
): Promise<{ file: CommentsFile | null; sha: string | null }> {
  const path = `${DIR}/${slug}.json`;
  const res = await fetch(`${API}/repos/${env.GH_REPO}/contents/${path}`, {
    headers: headers(env),
  });

  if (res.status === 404) {
    return { file: null, sha: null };
  }

  if (!res.ok) {
    throw new Error(`读取评论失败（GitHub ${res.status}）`);
  }

  const data = (await res.json()) as { content: string; sha: string };
  const parsed = JSON.parse(b64ToUtf8(data.content)) as CommentsFile;

  return {
    file: {
      slug: parsed.slug ?? slug,
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    },
    sha: data.sha,
  };
}

/** 写入评论文件。传入 sha 表示更新，不传表示新建；冲突抛 ConflictError */
async function writeComments(
  env: Env,
  slug: string,
  file: CommentsFile,
  sha: string | null
): Promise<void> {
  const path = `${DIR}/${slug}.json`;
  const res = await fetch(`${API}/repos/${env.GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `comments: 更新 ${slug} 的评论`,
      content: utf8ToB64(JSON.stringify(file, null, 2) + '\n'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });

  if (res.status === 409) throw new ConflictError();
  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { message?: string };
      detail = data.message ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`写入评论失败（GitHub ${res.status}${detail ? '：' + detail : ''}）`);
  }
}

/**
 * 通用的「读取-修改-写回」流程，遇冲突自动重试。
 * mutate 返回 false 表示无需写入。
 */
async function mutateFile<T>(
  env: Env,
  slug: string,
  mutate: (file: CommentsFile) => { changed: boolean; result: T }
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { file, sha } = await readComments(env, slug);
    const target = file ?? emptyFile(slug);
    const { changed, result } = mutate(target);

    if (!changed) return result;

    try {
      await writeComments(env, slug, target, sha);
      return result;
    } catch (err) {
      lastError = err;
      if (err instanceof ConflictError) continue;
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('评论写入冲突，请重试');
}

export interface NewCommentInput {
  author: string;
  content: string;
}

/** 追加一条评论 */
export async function appendComment(
  env: Env,
  slug: string,
  input: NewCommentInput
): Promise<Comment> {
  const author = input.author.trim();
  const content = input.content.trim();

  if (!author || author.length > MAX_AUTHOR) {
    throw new Error(`昵称长度需在 1–${MAX_AUTHOR} 字之间`);
  }
  if (!content || content.length > MAX_CONTENT) {
    throw new Error(`内容长度需在 1–${MAX_CONTENT} 字之间`);
  }

  return mutateFile(env, slug, (file) => {
    if (file.comments.length >= MAX_COMMENTS) {
      throw new Error('这篇文章的评论数量已达上限');
    }

    const comment: Comment = {
      id: newId(),
      author,
      content,
      createdAt: Date.now(),
      pinned: false,
      hidden: false,
    };

    file.comments.push(comment);
    return { changed: true, result: comment };
  });
}

/** 更新某条评论的置顶/隐藏状态 */
export async function updateComment(
  env: Env,
  slug: string,
  id: string,
  patch: { pinned?: boolean; hidden?: boolean }
): Promise<Comment> {
  return mutateFile(env, slug, (file) => {
    const comment = file.comments.find((c) => c.id === id);
    if (!comment) throw new Error('评论不存在');

    if (typeof patch.pinned === 'boolean') comment.pinned = patch.pinned;
    if (typeof patch.hidden === 'boolean') comment.hidden = patch.hidden;

    return { changed: true, result: comment };
  });
}

/** 删除一条评论 */
export async function deleteComment(env: Env, slug: string, id: string): Promise<void> {
  await mutateFile(env, slug, (file) => {
    const index = file.comments.findIndex((c) => c.id === id);
    if (index < 0) throw new Error('评论不存在');

    file.comments.splice(index, 1);
    return { changed: true, result: undefined };
  });
}

/** 列出所有文章的评论文件（管理端用） */
export async function listAllComments(
  env: Env
): Promise<{ slug: string; total: number; hidden: number; comments: Comment[] }[]> {
  const res = await fetch(`${API}/repos/${env.GH_REPO}/contents/${DIR}`, {
    headers: headers(env),
  });

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`读取评论目录失败（GitHub ${res.status}）`);

  const items = (await res.json()) as { name: string; type: string }[];
  const slugs = items
    .filter((item) => item.type === 'file' && item.name.endsWith('.json'))
    .map((item) => item.name.replace(/\.json$/, ''));

  const results = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const { file } = await readComments(env, slug);
        const comments = file?.comments ?? [];
        return {
          slug,
          total: comments.length,
          hidden: comments.filter((c) => c.hidden).length,
          comments,
        };
      } catch {
        return { slug, total: 0, hidden: 0, comments: [] };
      }
    })
  );

  return results.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** 前台展示用：过滤隐藏、置顶优先、时间正序 */
export function visibleComments(file: CommentsFile | null): Comment[] {
  if (!file) return [];

  const visible = file.comments.filter((c) => !c.hidden);
  const pinned = visible.filter((c) => c.pinned).sort((a, b) => b.createdAt - a.createdAt);
  const normal = visible.filter((c) => !c.pinned).sort((a, b) => a.createdAt - b.createdAt);

  return [...pinned, ...normal];
}
