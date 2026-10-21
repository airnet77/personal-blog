/**
 * 评论违禁词表接口（需要登录会话，由 _middleware.ts 统一拦截）
 *   GET  /api/admin/wordlist   读取当前词表 + 内置默认
 *   PUT  /api/admin/wordlist   保存全量词表；body.reset=true 时恢复默认
 */
import type { Env } from '../../lib/github';
import { DEFAULT_WORDLIST, CATEGORY_LABELS, CATEGORIES, HARD_CATEGORIES } from '../../lib/banned-words';
import { loadWordList, resetWordList, saveWordList } from '../../lib/wordlist-store';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function meta() {
  return {
    categories: CATEGORIES.map((category) => ({
      key: category,
      label: CATEGORY_LABELS[category],
      hard: HARD_CATEGORIES.includes(category),
      builtinCount: DEFAULT_WORDLIST[category].length,
    })),
  };
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: '服务端缺少 GH_TOKEN 或 GH_REPO' }, 500);
  }

  try {
    if (request.method === 'GET') {
      const wordlist = await loadWordList(env);
      return json({ wordlist, defaults: DEFAULT_WORDLIST, ...meta() });
    }

    if (request.method === 'PUT') {
      let payload: Record<string, unknown>;
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: '请求格式错误' }, 400);
      }

      const source =
        payload.reset === true
          ? resetWordList()
          : (payload.wordlist ?? payload.categories ?? payload);

      const wordlist = await saveWordList(env, source);
      return json({ ok: true, wordlist });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    return json({ error: message }, 502);
  }

  return json({ error: '不支持的请求方法' }, 405);
};
