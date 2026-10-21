/**
 * 设备身份：把浏览器算出的指纹归一化，并把 IP 变成不可逆短哈希。
 *
 * 说明：设备指纹是「尽力识别」，不是安全边界 —— 清缓存、换浏览器都能换一个新身份。
 * 所以每日配额同时按设备与 IP 两个维度计算，免得被轻易绕过。
 */

const DEVICE_ID_RE = /^[a-f0-9]{8,64}$/i;

/** 校验前端提交的设备指纹；非法一律当没有 */
export function normalizeDeviceId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!DEVICE_ID_RE.test(value)) return null;
  return value.toLowerCase();
}

/** 取 Cloudflare 注入的真实客户端 IP */
export function clientIp(request: Request): string | null {
  const value =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Real-IP') ??
    (request.headers.get('X-Forwarded-For') ?? '').split(',')[0]?.trim() ??
    '';
  return value || null;
}

/** IP → 8 位十六进制摘要，避免在前台/仓库里存明文 IP */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const bytes = Array.from(new Uint8Array(digest).slice(0, 4));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
