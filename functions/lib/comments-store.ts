/**
 * 评论存储层。
 * 数据以 JSON 文件形式存放在仓库的 comments/ 目录，每篇文章一个文件。
 * 读写、冲突重试等通用逻辑在 json-store.ts，这里只保留评论语义。
 */
import type { Env } from './github';
import { mutateJson, readJson } from './json-store';

/** visible=公开；pending=等人工审核；rejected=判违规（默认隐藏，前台永不展示） */
export type CommentStatus = 'visible' | 'pending' | 'rejected';

export interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  pinned: boolean;
  hidden: boolean;
  status?: CommentStatus;
  deviceId?: string;
  ipHash?: string;
  reviewReason?: string;
}

export interface CommentsFile {
  slug: string;
  comments: Comment[];
}

const DIR = 'comments';
/** 单篇文章的评论条数硬上限（含待审与违规留档） */
const MAX_COMMENTS = 800;

const API = 'https://api.github.com';

function headers(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'airnet-blog-comments',
  };
}

function newId(): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `c_${Date.now()}_${rand}`;
}

function filePath(slug: string): string {
  return `${DIR}/${slug}.json`;
}

function normalizeFile(input: unknown, slug: string): CommentsFile {
  const raw = (input ?? {}) as Partial<CommentsFile>;
  return {
    slug: typeof raw.slug === 'string' && raw.slug ? raw.slug : slug,
    comments: Array.isArray(raw.comments) ? (raw.comments as Comment[]) : [],
  };
}

export function statusOf(comment: Comment): CommentStatus {
  return comment.status ?? 'visible';
}

/** 读取某篇文章的评论文件。文件不存在时返回 null */
export async function readComments(
  env: Env,
  slug: string
): Promise<{ file: CommentsFile | null; sha: string | null }> {
  const { data, sha } = await readJson<unknown>(env, filePath(slug));
  if (!data) return { file: null, sha: null };
  return { file: normalizeFile(data, slug), sha };
}

/** 通用的「读取-修改-写回」，冲突由 json-store 自动重试 */
async function mutateFile<T>(
  env: Env,
  slug: string,
  mutate: (file: CommentsFile) => { changed: boolean; result: T }
): Promise<T> {
  return mutateJson<CommentsFile, T>(env, filePath(slug), (current) => {
    const file = normalizeFile(current, slug);
    const { changed, result } = mutate(file);
    return { changed, next: changed ? file : undefined, result };
  });
}

/** 违规留档超上限时，优先淘汰最旧的 rejected，其次最旧的 hidden */
function trimFile(file: CommentsFile, maxRejected: number): void {
  const rejected = file.comments.filter((c) => statusOf(c) === 'rejected');
  if (maxRejected >= 0 && rejected.length > maxRejected) {
    const remove = new Set(
      rejected
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, rejected.length - maxRejected)
        .map((c) => c.id)
    );
    file.comments = file.comments.filter((c) => !remove.has(c.id));
  }

  if (file.comments.length > MAX_COMMENTS) {
    const removable = file.comments
      .filter((c) => statusOf(c) !== 'visible' || c.hidden)
      .sort((a, b) => a.createdAt - b.createdAt);
    const overflow = file.comments.length - MAX_COMMENTS;
    const remove = new Set(removable.slice(0, overflow).map((c) => c.id));
    file.comments = file.comments.filter((c) => !remove.has(c.id));
  }
}

export interface NewCommentInput {
  author: string;
  content: string;
  status: CommentStatus;
  deviceId?: string;
  ipHash?: string;
  reviewReason?: string;
  /** 违规留档上限；0 表示不保留违规记录 */
  maxRejected?: number;
}

/** 追加一条评论（可见 / 待审 / 违规留档） */
export async function appendComment(
  env: Env,
  slug: string,
  input: NewCommentInput
): Promise<Comment> {
  const author = input.author.trim();
  const content = input.content.trim();

  if (!author) throw new Error('昵称为空');
  if (!content) throw new Error('内容为空');

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
      status: input.status,
    };

    if (input.deviceId) comment.deviceId = input.deviceId;
    if (input.ipHash) comment.ipHash = input.ipHash;
    if (input.reviewReason) comment.reviewReason = input.reviewReason;

    file.comments.push(comment);
    trimFile(file, input.maxRejected ?? 200);

    return { changed: true, result: comment };
  });
}

export interface CommentPatch {
  pinned?: boolean;
  hidden?: boolean;
  status?: CommentStatus;
}

/** 更新置顶 / 隐藏 / 状态（通过待审、恢复违规） */
export async function updateComment(
  env: Env,
  slug: string,
  id: string,
  patch: CommentPatch
): Promise<Comment> {
  return mutateFile(env, slug, (file) => {
    const comment = file.comments.find((c) => c.id === id);
    if (!comment) throw new Error('评论不存在');

    if (typeof patch.pinned === 'boolean') comment.pinned = patch.pinned;
    if (typeof patch.hidden === 'boolean') comment.hidden = patch.hidden;
    if (patch.status) comment.status = patch.status;

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

export interface PostComments {
  slug: string;
  total: number;
  visible: number;
  pending: number;
  rejected: number;
  hidden: number;
  comments: Comment[];
}

/** 列出所有文章的评论文件（管理端用）。跳过 _ 开头的配置文件 */
export async function listAllComments(env: Env): Promise<PostComments[]> {
  const res = await fetch(`${API}/repos/${env.GH_REPO}/contents/${DIR}`, {
    headers: headers(env),
  });

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`读取评论目录失败（GitHub ${res.status}）`);

  const items = (await res.json()) as { name: string; type: string }[];
  const slugs = items
    .filter(
      (item) => item.type === 'file' && item.name.endsWith('.json') && !item.name.startsWith('_')
    )
    .map((item) => item.name.replace(/\.json$/, ''));

  const results = await Promise.all(
    slugs.map(async (slug): Promise<PostComments> => {
      try {
        const { file } = await readComments(env, slug);
        const comments = file?.comments ?? [];
        return {
          slug,
          total: comments.length,
          visible: comments.filter((c) => statusOf(c) === 'visible' && !c.hidden).length,
          pending: comments.filter((c) => statusOf(c) === 'pending').length,
          rejected: comments.filter((c) => statusOf(c) === 'rejected').length,
          hidden: comments.filter((c) => c.hidden && statusOf(c) === 'visible').length,
          comments,
        };
      } catch {
        return { slug, total: 0, visible: 0, pending: 0, rejected: 0, hidden: 0, comments: [] };
      }
    })
  );

  return results.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** 前台展示：只取 visible 且未隐藏；置顶优先，其余时间正序 */
export function visibleComments(file: CommentsFile | null): Comment[] {
  if (!file) return [];

  const visible = file.comments.filter((c) => statusOf(c) === 'visible' && !c.hidden);
  const pinned = visible.filter((c) => c.pinned).sort((a, b) => b.createdAt - a.createdAt);
  const normal = visible.filter((c) => !c.pinned).sort((a, b) => a.createdAt - b.createdAt);

  return [...pinned, ...normal];
}

/** 给浏览器看的字段（去掉设备标识与审核内部信息） */
export function publicComment(comment: Comment) {
  return {
    id: comment.id,
    author: comment.author,
    content: comment.content,
    createdAt: comment.createdAt,
    pinned: Boolean(comment.pinned),
  };
}
