/**
 * GET    /api/posts/:slug  读取单篇（含正文）
 * PUT    /api/posts/:slug  保存（可带 sha 做冲突检测）
 * DELETE /api/posts/:slug  删除
 */
import { readPost, writePost, removePost, type Env } from '../../lib/github';
import { parsePost, serializePost, normalizeDate } from '../../lib/frontmatter';

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
  const { request, env, params } = context as {
    request: Request;
    env: Env;
    params: { slug?: string };
  };

  const slug = String(params?.slug ?? '').trim();
  if (!SLUG_RE.test(slug)) {
    return json({ error: '无效的文章标识' }, 400);
  }

  try {
    if (request.method === 'GET') {
      const { raw, sha } = await readPost(env, slug);
      const { data, body } = parsePost(raw);
      return json({ slug, sha, ...data, body });
    }

    if (request.method === 'PUT') {
      let payload: Record<string, unknown>;
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: '请求格式错误' }, 400);
      }

      const existing = await readPost(env, slug).catch(() => null);
      const base = existing ? parsePost(existing.raw).data : null;

      const raw = serializePost(
        {
          title: String(payload.title ?? base?.title ?? ''),
          description: String(payload.description ?? base?.description ?? ''),
          pubDate: normalizeDate(payload.pubDate ?? base?.pubDate ?? new Date()),
          updatedDate: new Date().toISOString().slice(0, 10),
          tags: Array.isArray(payload.tags) ? payload.tags.map(String) : (base?.tags ?? []),
          draft: payload.draft === true,
        },
        String(payload.body ?? '')
      );

      // 带上客户端持有的 sha，GitHub 会在文件已被他人修改时返回 409
      const sha = typeof payload.sha === 'string' && payload.sha ? payload.sha : existing?.sha;

      const { commit } = await writePost(env, slug, raw, sha);
      return json({ ok: true, slug, commit });
    }

    if (request.method === 'DELETE') {
      let payload: Record<string, unknown> = {};
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        /* 允许无 body */
      }

      const sha =
        typeof payload.sha === 'string' && payload.sha
          ? payload.sha
          : (await readPost(env, slug)).sha;

      const { commit } = await removePost(env, slug, sha);
      return json({ ok: true, slug, commit });
    }
  } catch (err: any) {
    if (err?.status === 404) return json({ error: '文章不存在' }, 404);
    if (err?.status === 409) return json({ error: '这篇文章已被其他地方修改，请刷新后重试' }, 409);
    return json({ error: errorMessage(err) }, 502);
  }

  return json({ error: '不支持的请求方法' }, 405);
};
