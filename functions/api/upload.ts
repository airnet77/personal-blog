/**
 * POST /api/upload
 * multipart/form-data，字段名 file，上传图片到 src/assets/blog/
 */
import { uploadImage, type Env } from '../lib/github';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (request.method !== 'POST') {
    return json({ error: '只支持 POST' }, 405);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: '请求必须是 multipart/form-data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return json({ error: '缺少 file 字段' }, 400);
  }

  if (!file.type.startsWith('image/')) {
    return json({ error: '只支持图片文件' }, 400);
  }

  if (file.size > MAX_SIZE) {
    return json({ error: '图片不能超过 5MB' }, 400);
  }

  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(-60);

  const filename = `${Date.now()}-${safeName || 'image'}`;
  const base64 = bufferToBase64(await file.arrayBuffer());

  try {
    const result = await uploadImage(env, filename, base64);
    return json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败';
    return json({ error: message }, 502);
  }
};
