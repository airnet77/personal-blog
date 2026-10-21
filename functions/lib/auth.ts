/**
 * 会话签名与校验。
 * 基于 Web Crypto 的 HMAC-SHA256（Cloudflare Workers 运行时原生支持，无第三方依赖）。
 */

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64Url(sig);
}

/** 生成会话 token，格式：<过期时间戳>.<签名> */
export async function createSession(secret: string, ttlMs: number): Promise<string> {
  const exp = Date.now() + ttlMs;
  const payload = String(exp);
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

/** 校验会话 token：签名正确且未过期 */
export async function verifySession(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const dot = token.indexOf('.');
  if (dot < 0) return false;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return false;

  const expected = await hmac(secret, payload);

  // 常量时间比较，避免时序侧信道
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i += 1) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

/** 从 Cookie 头里取出指定名字的值 */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** 生成会话 Cookie */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

/** 清除会话 Cookie */
export function clearSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
