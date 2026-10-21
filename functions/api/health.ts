/**
 * GET /api/health
 * 配置自检：告诉缺少哪些环境变量，不返回任何敏感值。
 */
import type { Env } from '../lib/github';
import { aiConfigured } from '../lib/ai-review';

export const onRequest = async (context: any) => {
  const { env } = context as { env: Env };

  const checks = {
    GH_TOKEN: Boolean(env.GH_TOKEN),
    GH_REPO: Boolean(env.GH_REPO),
    ADMIN_PASSWORD: Boolean(env.ADMIN_PASSWORD),
    SESSION_SECRET: Boolean(env.SESSION_SECRET),
    AI_API_KEY: Boolean((env.AI_API_KEY ?? '').trim()),
    AI_BASE_URL: Boolean((env.AI_BASE_URL ?? '').trim()),
    /** AI 是否具备可用条件（provider + 地址 + key 齐了才算就绪） */
    AI_READY: aiConfigured(env),
  };

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return new Response(
    JSON.stringify({
      ok: missing.length === 0,
      checks,
      missing,
      repo: env.GH_REPO || null,
      aiProvider: (env.AI_PROVIDER ?? 'openai').toLowerCase(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
};
