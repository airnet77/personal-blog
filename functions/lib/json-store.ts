/**
 * 通用 JSON 文件存储（GitHub Contents API）。
 *
 * 只负责「读取 — 修改 — 写回」，不理解任何业务语义。
 * 评论、配置、违禁词表、审核台账都复用它，避免各自实现一遍重试逻辑。
 *
 * 契约：
 *   - 文件不存在时 readJson 返回 { data: null, sha: null }，不抛错
 *   - mutateJson 遇 409 冲突最多重试 3 次
 *   - 其他错误原样抛出，由调用方决定怎么呈现
 */
import type { Env } from './github';

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

export function b64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function utf8ToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export interface JsonSnapshot<T> {
  data: T | null;
  sha: string | null;
}

/** 读取一个 JSON 文件。不存在返回 null；内容非法 JSON 也返回 null（调用方用默认值兜底） */
export async function readJson<T>(env: Env, path: string): Promise<JsonSnapshot<T>> {
  const res = await fetch(`${API}/repos/${env.GH_REPO}/contents/${path}`, {
    headers: headers(env),
  });

  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new Error(`读取 ${path} 失败（GitHub ${res.status}）`);

  const payload = (await res.json()) as { content: string; sha: string };

  let data: T | null = null;
  try {
    data = JSON.parse(b64ToUtf8(payload.content)) as T;
  } catch {
    data = null;
  }

  return { data, sha: payload.sha };
}

/** 写入 JSON 文件。传 sha 表示更新，不传表示新建；409 抛 ConflictError */
export async function writeJson(
  env: Env,
  path: string,
  data: unknown,
  sha: string | null,
  message: string
): Promise<void> {
  const res = await fetch(`${API}/repos/${env.GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: utf8ToB64(`${JSON.stringify(data, null, 2)}\n`),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });

  if (res.status === 409) throw new ConflictError();
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? '';
    } catch {
      /* 忽略解析失败 */
    }
    throw new Error(`写入 ${path} 失败（GitHub ${res.status}${detail ? `：${detail}` : ''}）`);
  }
}

/** mutate 返回值：changed=false 表示无需写盘，直接返回 result */
export interface Mutation<T, R> {
  changed: boolean;
  next?: T;
  result: R;
}

/**
 * 原子化的「读 — 改 — 写」。遇并发冲突自动重读重试。
 * 文件不存在时 current 为 null，由 mutate 自行决定初始值。
 */
export async function mutateJson<T, R>(
  env: Env,
  path: string,
  mutate: (current: T | null) => Mutation<T, R>
): Promise<R> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, sha } = await readJson<T>(env, path);
    const { changed, next, result } = mutate(data);

    if (!changed || next === undefined) return result;

    try {
      await writeJson(env, path, next, sha, `chore: 更新 ${path}`);
      return result;
    } catch (err) {
      lastError = err;
      if (err instanceof ConflictError) continue;
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('写入冲突，请重试');
}
