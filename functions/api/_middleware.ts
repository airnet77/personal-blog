/**
 * 认证中间件：保护 /api/* 下除登录外的所有接口。
 */
import { readCookie, verifySession } from '../lib/auth';
import type { Env } from '../lib/github';

/** 无需登录即可访问的路径（登出是幂等的，允许未登录调用） */
const PUBLIC_PATHS = new Set(['/api/login', '/api/health', '/api/logout']);

export const onRequest = async (context: any) => {
  const { request, env, next } = context as {
    request: Request;
    env: Env;
    next: () => Promise<Response>;
  };

  const url = new URL(request.url);

  if (PUBLIC_PATHS.has(url.pathname) || request.method === 'OPTIONS') {
    return next();
  }

  if (!env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: '服务端未配置 SESSION_SECRET' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const token = readCookie(request.headers.get('Cookie'), 'session');
  const valid = await verifySession(env.SESSION_SECRET, token);

  if (!valid) {
    return new Response(JSON.stringify({ error: '未登录或登录已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  return next();
};
