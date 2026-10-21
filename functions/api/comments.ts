/**
 * 公共评论接口（读者端，无需登录）
 *   GET  /api/comments?slug=xxx  读取可见评论
 *   POST /api/comments           提交评论
 */
import type { Env } from '../lib/github';
import { readComments, appendComment, visibleComments } from '../lib/comments-store';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 确认 slug 对应一篇真实存在的文章，防止垃圾灌到任意路径 */
async function articleExists(env: Env, slug: string): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/contents/src/content/blog/${slug}.md`,
    {
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'airnet-blog-comments',
      },
    }
  );
  return res.status === 200;
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: '服务端缺少 GH_TOKEN 或 GH_REPO' }, 500);
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const slug = (url.searchParams.get('slug') ?? '').trim();
    if (!SLUG_RE.test(slug)) {
      return json({ error: '无效的文章标识' }, 400);
    }

    try {
      const { file } = await readComments(env, slug);
      return json({ comments: visibleComments(file) });
    } catch (err) {
      const message = err instanceof Error ? err.message : '读取评论失败';
      return json({ error: message }, 502);
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
    const author = String(payload.author ?? '').trim();
    const content = String(payload.content ?? '').trim();
    const website = String(payload.website ?? '').trim();

    if (!SLUG_RE.test(slug)) {
      return json({ error: '无效的文章标识' }, 400);
    }

    // 蜜罐字段：正常用户看不到也填不了，填了就是机器人
    if (website) {
      return json({ ok: true });
    }

    if (!author || author.length > 30) {
      return json({ error: '昵称需在 1–30 字之间' }, 400);
    }
    if (!content || content.length > 2000) {
      return json({ error: '内容需在 1–2000 字之间' }, 400);
    }

    try {
      const exists = await articleExists(env, slug);
      if (!exists) {
        return json({ error: '文章不存在' }, 404);
      }

      const { file } = await readComments(env, slug);
      const recent = (file?.comments ?? []).filter(
        (c) => c.createdAt > Date.now() - RATE_WINDOW_MS
      );
      if (recent.length >= RATE_LIMIT) {
        return json({ error: '评论过于频繁，请稍后再试' }, 429);
      }

      const comment = await appendComment(env, slug, { author, content });
      return json({ ok: true, comment }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交失败';
      const isValidation = message.includes('长度') || message.includes('上限');
      return json({ error: message }, isValidation ? 400 : 502);
    }
  }

  return json({ error: '不支持的请求方法' }, 405);
};
