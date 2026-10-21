/**
 * POST /api/login
 * body: { password }
 */
import { createSession, sessionCookie } from '../lib/auth';
import type { Env } from '../lib/github';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

/** 常量时间字符串比较，降低时序攻击可读性 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (request.method !== 'POST') {
    return json({ error: '只支持 POST' }, 405);
  }

  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: '服务端缺少 ADMIN_PASSWORD 或 SESSION_SECRET 环境变量' }, 500);
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    password = String(body?.password ?? '');
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  if (!password) {
    return json({ error: '请输入密码' }, 400);
  }

  if (!safeEqual(password, env.ADMIN_PASSWORD)) {
    // 失败时稍作延迟，抬高暴力破解成本
    await sleep(600);
    return json({ error: '密码错误' }, 401);
  }

  const token = await createSession(env.SESSION_SECRET, SESSION_TTL_MS);

  return json({ ok: true }, 200, {
    'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
  });
};
