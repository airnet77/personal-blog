/**
 * 评论设置接口（需要登录会话，由 _middleware.ts 统一拦截）
 *   GET /api/admin/settings   读取完整配置 + AI 就绪状态
 *   PUT /api/admin/settings   保存配置（与现有值合并）
 */
import type { Env } from '../../lib/github';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../../lib/comment-config';
import { aiConfigured } from '../../lib/ai-review';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function aiStatus(env: Env, model: string) {
  return {
    provider: (env.AI_PROVIDER ?? 'openai').trim().toLowerCase(),
    model,
    configured: aiConfigured(env),
  };
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: '服务端缺少 GH_TOKEN 或 GH_REPO' }, 500);
  }

  try {
    if (request.method === 'GET') {
      const config = await loadConfig(env);
      return json({ config, defaults: DEFAULT_CONFIG, ai: aiStatus(env, config.aiModel) });
    }

    if (request.method === 'PUT') {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return json({ error: '请求格式错误' }, 400);
      }

      const config = await saveConfig(env, payload);
      return json({ ok: true, config, ai: aiStatus(env, config.aiModel) });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    return json({ error: message }, 502);
  }

  return json({ error: '不支持的请求方法' }, 405);
};
