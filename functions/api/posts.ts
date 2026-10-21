/**
 * GET  /api/posts  列出所有文章（含元数据，不含正文）
 * POST /api/posts  新建文章
 */
import { listPostFiles, readPost, writePost, type Env } from '../lib/github';
import { parsePost, serializePost, normalizeDate } from '../lib/frontmatter';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return '未知错误';
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (request.method === 'GET') {
    try {
      const files = await listPostFiles(env);

      const posts = await Promise.all(
        files.map(async (file) => {
          try {
            const { raw } = await readPost(env, file.slug);
            const { data } = parsePost(raw);
            return { slug: file.slug, sha: file.sha, ...data };
          } catch {
            return null;
          }
        })
      );

      const list = posts
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));

      return json({ posts: list });
    } catch (err) {
      return json({ error: errorMessage(err) }, 502);
    }
  }

  if (request.method === 'POST') {
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: '请求格式错误' }, 400);
    }

    const slug = String(payload.slug ?? '').trim();
    if (!SLUG_RE.test(slug)) {
      return json(
        { error: 'slug 只能用小写字母、数字和连字符，不能以连字符开头，最长 80 字符' },
        400
      );
    }

    const raw = serializePost(
      {
        title: String(payload.title ?? '未命名文章'),
        description: String(payload.description ?? ''),
        pubDate: normalizeDate(payload.pubDate ?? new Date()),
        tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
        draft: payload.draft === true,
      },
      String(payload.body ?? `# ${String(payload.title ?? '未命名文章')}\n`)
    );

    try {
      const { commit } = await writePost(env, slug, raw);
      return json({ ok: true, slug, commit }, 201);
    } catch (err) {
      return json({ error: errorMessage(err) }, 502);
    }
  }

  return json({ error: '不支持的请求方法' }, 405);
};
