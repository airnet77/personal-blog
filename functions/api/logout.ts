/**
 * POST /api/logout
 * 清除会话 Cookie。
 */
import { clearSessionCookie } from '../lib/auth';

export const onRequest = async (context: any) => {
  const { request } = context as { request: Request };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '只支持 POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': clearSessionCookie(),
      'Cache-Control': 'no-store',
    },
  });
};
