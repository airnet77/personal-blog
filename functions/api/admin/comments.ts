/**
 * 评论管理接口（需要登录会话，由 _middleware.ts 统一拦截）
 *   GET    /api/admin/comments                 列出所有文章的评论
 *   PATCH  /api/admin/comments?slug=x&id=y     更新置顶/隐藏
 *   DELETE /api/admin/comments?slug=x&id=y     删除
 */
import type { Env } from '../../lib/github';
import { listAllComments, updateComment, deleteComment } from '../../lib/comments-store';

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

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: '服务端缺少 GH_TOKEN 或 GH_REPO' }, 500);
  }

  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') ?? '').trim();
  const id = (url.searchParams.get('id') ?? '').trim();

  try {
    if (request.method === 'GET') {
      const posts = await listAllComments(env);
      const total = posts.reduce((sum, p) => sum + p.total, 0);
      const hidden = posts.reduce((sum, p) => sum + p.hidden, 0);
      return json({ posts, total, hidden });
    }

    if (request.method === 'PATCH') {
      if (!SLUG_RE.test(slug) || !id) {
        return json({ error: '缺少或非法的 slug / id' }, 400);
      }

      let payload: Record<string, unknown>;
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: '请求格式错误' }, 400);
      }

      const patch: { pinned?: boolean; hidden?: boolean } = {};
      if (typeof payload.pinned === 'boolean') patch.pinned = payload.pinned;
      if (typeof payload.hidden === 'boolean') patch.hidden = payload.hidden;

      if (Object.keys(patch).length === 0) {
        return json({ error: '没有可更新的字段' }, 400);
      }

      const comment = await updateComment(env, slug, id, patch);
      return json({ ok: true, comment });
    }

    if (request.method === 'DELETE') {
      if (!SLUG_RE.test(slug) || !id) {
        return json({ error: '缺少或非法的 slug / id' }, 400);
      }

      await deleteComment(env, slug, id);
      return json({ ok: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    if (message.includes('不存在')) return json({ error: message }, 404);
    return json({ error: message }, 502);
  }

  return json({ error: '不支持的请求方法' }, 405);
};
