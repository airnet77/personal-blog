/**
 * GET /api/health
 * 配置自检：告诉缺少哪些环境变量，不返回任何敏感值。
 */
import type { Env } from '../lib/github';

export const onRequest = async (context: any) => {
  const { env } = context as { env: Env };

  const checks = {
    GH_TOKEN: Boolean(env.GH_TOKEN),
    GH_REPO: Boolean(env.GH_REPO),
    ADMIN_PASSWORD: Boolean(env.ADMIN_PASSWORD),
    SESSION_SECRET: Boolean(env.SESSION_SECRET),
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
