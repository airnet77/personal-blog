/**
 * 评论用户管理接口（需要登录会话）
 *   GET   /api/admin/moderation            设备档案列表与汇总
 *   PATCH /api/admin/moderation            封禁 / 解封 / 清零违规 / 删除档案
 */
import type { Env } from '../../lib/github';
import { listDevices, todayKey, updateDevice } from '../../lib/moderation';

const DEVICE_RE = /^[a-f0-9]{8,64}$/i;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: '服务端缺少 GH_TOKEN 或 GH_REPO' }, 500);
  }

  try {
    if (request.method === 'GET') {
      const devices = await listDevices(env);
      const today = todayKey();
      const stats = {
        total: devices.length,
        blocked: devices.filter((d) => d.blocked).length,
        todayComments: devices.reduce((sum, d) => sum + d.todayCount, 0),
        today: today,
      };
      return json({ devices, stats });
    }

    if (request.method === 'PATCH') {
      let payload: Record<string, unknown>;
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: '请求格式错误' }, 400);
      }

      const deviceId = String(payload.deviceId ?? '').trim().toLowerCase();
      const action = String(payload.action ?? '').trim();

      if (!DEVICE_RE.test(deviceId)) {
        return json({ error: '设备标识非法' }, 400);
      }

      if (!['block', 'unblock', 'clear', 'delete'].includes(action)) {
        return json({ error: '不支持的操作' }, 400);
      }

      const days = Number(payload.days ?? 7);
      await updateDevice(
        env,
        deviceId,
        action as 'block' | 'unblock' | 'clear' | 'delete',
        Number.isFinite(days) ? days : 7
      );

      return json({ ok: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败';
    if (message.includes('不存在')) return json({ error: message }, 404);
    return json({ error: message }, 502);
  }

  return json({ error: '不支持的请求方法' }, 405);
};
