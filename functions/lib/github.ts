/**
 * GitHub Contents API 封装。
 * 所有写操作都在服务端执行，令牌不会下发到浏览器。
 */

export interface Env {
  GH_TOKEN: string;
  GH_REPO: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;

  /** 评论 AI 审核（可选）：provider / base url / key */
  AI_PROVIDER?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  /** Workers AI 模式下需要账号 ID */
  CF_ACCOUNT_ID?: string;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API = 'https://api.github.com';
const POSTS_DIR = 'src/content/blog';

function headers(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'airnet-blog-admin',
  };
}

async function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}/repos/${env.GH_REPO}${path}`, {
    ...init,
    headers: {
      ...headers(env),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { message?: string };
      detail = data.message ?? '';
    } catch {
      /* 忽略解析失败 */
    }
    throw new GitHubError(res.status, detail || `GitHub API ${res.status}`);
  }

  return res;
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

export interface PostFile {
  slug: string;
  sha: string;
  path: string;
}

/** 列出文章目录下的所有 .md 文件（不含内容） */
export async function listPostFiles(env: Env): Promise<PostFile[]> {
  const res = await gh(env, `/contents/${POSTS_DIR}`);
  const items = (await res.json()) as { name: string; sha: string; path: string; type: string }[];

  return items
    .filter((item) => item.type === 'file' && item.name.endsWith('.md'))
    .map((item) => ({
      slug: item.name.replace(/\.md$/, ''),
      sha: item.sha,
      path: item.path,
    }));
}

/** 读取单篇文章的原始 Markdown 与当前 sha */
export async function readPost(
  env: Env,
  slug: string
): Promise<{ raw: string; sha: string; path: string }> {
  const path = `${POSTS_DIR}/${slug}.md`;
  const res = await gh(env, `/contents/${path}`);
  const data = (await res.json()) as { content: string; sha: string; path: string };

  return {
    raw: b64ToUtf8(data.content),
    sha: data.sha,
    path: data.path,
  };
}

/** 写入（新建或更新）一篇文章。传入 sha 时按更新处理，避免覆盖他人改动 */
export async function writePost(
  env: Env,
  slug: string,
  raw: string,
  sha?: string
): Promise<{ commit: string }> {
  const path = `${POSTS_DIR}/${slug}.md`;
  const res = await gh(env, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: sha ? `docs: 更新文章 ${slug}` : `docs: 新增文章 ${slug}`,
      content: utf8ToB64(raw),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });

  const data = (await res.json()) as { commit: { sha: string } };
  return { commit: data.commit.sha };
}

/** 删除一篇文章 */
export async function removePost(env: Env, slug: string, sha: string): Promise<{ commit: string }> {
  const path = `${POSTS_DIR}/${slug}.md`;
  const res = await gh(env, `/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `docs: 删除文章 ${slug}`,
      sha,
      branch: 'main',
    }),
  });

  const data = (await res.json()) as { commit: { sha: string } };
  return { commit: data.commit.sha };
}

/** 上传一张图片到 src/assets/blog/，返回可写进 Markdown 的相对路径 */
export async function uploadImage(
  env: Env,
  filename: string,
  base64Content: string
): Promise<{ path: string; markdownPath: string; commit: string }> {
  const path = `src/assets/blog/${filename}`;
  const res = await gh(env, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `assets: 上传图片 ${filename}`,
      content: base64Content,
      branch: 'main',
    }),
  });

  const data = (await res.json()) as { commit: { sha: string } };
  return {
    path,
    // 文章位于 src/content/blog/，到 src/assets/ 需要回退两层
    markdownPath: `../../assets/blog/${filename}`,
    commit: data.commit.sha,
  };
}
