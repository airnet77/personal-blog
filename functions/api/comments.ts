/**
 * 公共评论接口（读者端，无需登录）
 *   GET  /api/comments?slug=xxx  读取公开评论（仅 visible）
 *   POST /api/comments           提交评论（过违禁词 / 格式 / 规则 / AI 四道闸）
 *
 * 判定结果：
 *   visible  正常展示
 *   pending  AI 拿不准或词表降级模式 → 等博主人工审核
 *   rejected 命中政治/违禁词/格式/规则/AI 明确违规 → 默认隐藏，仅后台留档
 */
import type { Env } from '../lib/github';
import {
  appendComment,
  publicComment,
  readComments,
  visibleComments,
  type CommentStatus,
} from '../lib/comments-store';
import { loadConfig, type CommentConfig } from '../lib/comment-config';
import { loadWordList } from '../lib/wordlist-store';
import { checkBannedWords } from '../lib/word-filter';
import { CATEGORY_LABELS } from '../lib/banned-words';
import { auditMarkdown, ISSUE_MESSAGES } from '../lib/markdown-guard';
import { reviewComment } from '../lib/ai-review';
import { checkPostAllowed, recordOutcome } from '../lib/moderation';
import { clientIp, hashIp, normalizeDeviceId } from '../lib/device';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** 文章是否存在：同一实例内缓存 5 分钟，避免每次发评论都打一次 GitHub */
const existsCache = new Map<string, { at: number; exists: boolean }>();
const EXISTS_TTL_MS = 5 * 60_000;
const EXISTS_CACHE_MAX = 200;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function articleExists(env: Env, slug: string): Promise<boolean> {
  const cached = existsCache.get(slug);
  if (cached && Date.now() - cached.at < EXISTS_TTL_MS) return cached.exists;

  const res = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/contents/src/content/blog/${slug}.md`,
    {
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'airnet-blog-comments',
      },
    }
  );

  const exists = res.status === 200;

  if (existsCache.size >= EXISTS_CACHE_MAX) existsCache.clear();
  existsCache.set(slug, { at: Date.now(), exists });

  return exists;
}

function clientConfig(cfg: CommentConfig) {
  return {
    enabled: cfg.enabled,
    maxAuthor: cfg.maxAuthor,
    maxLength: cfg.maxLength,
    pageSize: cfg.pageSize,
    collapseChars: cfg.collapseChars,
    allowLinks: cfg.allowLinks,
    allowImages: cfg.allowImages,
    allowHtml: cfg.allowHtml,
  };
}

export const onRequest = async (context: any) => {
  const { request, env } = context as { request: Request; env: Env };

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: '服务端缺少 GH_TOKEN 或 GH_REPO' }, 500);
  }

  const url = new URL(request.url);
  const cfg = await loadConfig(env);

  if (request.method === 'GET') {
    const slug = (url.searchParams.get('slug') ?? '').trim();
    if (!SLUG_RE.test(slug)) {
      return json({ error: '无效的文章标识' }, 400);
    }

    try {
      const { file } = await readComments(env, slug);
      return json({
        comments: visibleComments(file).map(publicComment),
        config: clientConfig(cfg),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '读取评论失败';
      return json({ error: message }, 502);
    }
  }

  if (request.method !== 'POST') {
    return json({ error: '不支持的请求方法' }, 405);
  }

  if (!cfg.enabled) {
    return json({ error: '评论功能已关闭', code: 'CLOSED' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: '请求格式错误', code: 'INVALID' }, 400);
  }

  const slug = String(payload.slug ?? '').trim();
  const author = String(payload.author ?? '').trim();
  const content = String(payload.content ?? '').trim();
  const honeypot = String(payload.website ?? '').trim();

  if (!SLUG_RE.test(slug)) {
    return json({ error: '无效的文章标识', code: 'INVALID' }, 400);
  }

  // 蜜罐：正常用户看不到这个字段，填了就是机器人，假装成功
  if (honeypot) return json({ ok: true, status: 'visible' });

  const ip = clientIp(request);
  const ipHash = cfg.recordIp ? await hashIp(ip) : null;
  const resolvedDevice = normalizeDeviceId(payload.deviceId) ?? ipHash;

  if (!resolvedDevice) {
    return json({ error: '无法识别设备，请刷新页面后重试', code: 'INVALID' }, 400);
  }

  /** 收窄成 string，闭包里才能安全使用 */
  const deviceId: string = resolvedDevice;

  /** 记录台账失败不影响主流程 */
  async function safeRecord(strikeReason?: string): Promise<void> {
    try {
      await recordOutcome(env, cfg, { deviceId, ipHash, author, slug, strikeReason });
    } catch (err) {
      console.error('台账写入失败', err);
    }
  }

  /** 判违规：留档（可关）+ 记一次违规，然后返回 400 */
  async function reject(reason: string) {
    if (cfg.keepRejected) {
      try {
        await appendComment(env, slug, {
          author,
          content,
          status: 'rejected',
          deviceId,
          ipHash: ipHash ?? undefined,
          reviewReason: reason,
          maxRejected: cfg.maxRejectedPerPost,
        });
      } catch (err) {
        console.error('违规评论留档失败', err);
      }
    }

    await safeRecord(reason);
    return json({ error: `评论违规，未发送：${reason}`, code: 'REJECTED', reason }, 400);
  }

  /** 进入人工审核 */
  async function acceptPending(reason: string) {
    try {
      await appendComment(env, slug, {
        author,
        content,
        status: 'pending',
        deviceId,
        ipHash: ipHash ?? undefined,
        reviewReason: reason,
        maxRejected: cfg.maxRejectedPerPost,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交失败';
      return json({ error: message, code: 'SERVER' }, 502);
    }

    await safeRecord();
    return json({ ok: true, status: 'pending', message: '已提交，审核通过后展示' }, 200);
  }

  try {
    const limited = await checkPostAllowed(env, cfg, deviceId, ipHash);
    if (!limited.ok) {
      return json({ error: limited.message, code: 'LIMITED' }, limited.code);
    }

    if (!author || author.length > cfg.maxAuthor) {
      return json({ error: `昵称需在 1–${cfg.maxAuthor} 字之间`, code: 'INVALID' }, 400);
    }
    if (!content || content.length > cfg.maxLength) {
      return json({ error: `内容需在 1–${cfg.maxLength} 字之间`, code: 'INVALID' }, 400);
    }

    const exists = await articleExists(env, slug);
    if (!exists) {
      return json({ error: '文章不存在', code: 'INVALID' }, 404);
    }

    // 第一道：违禁词（涉政类硬拒，不受「待审模式」降级）
    const wordlist = await loadWordList(env);
    const hit = checkBannedWords(`${author}\n${content}`, wordlist);
    if (hit) {
      const label = CATEGORY_LABELS[hit.category];
      if (hit.hard || cfg.wordListMode === 'block') {
        return await reject(label);
      }
      return await acceptPending(label);
    }

    // 第二道：只许文字（链接 / 图片 / HTML / 裸 URL / 控制字符）
    const guardOptions = {
      allowLinks: cfg.allowLinks,
      allowImages: cfg.allowImages,
      allowHtml: cfg.allowHtml,
    };

    const contentGuard = auditMarkdown(content, guardOptions);
    if (!contentGuard.ok && contentGuard.issue) {
      return await reject(ISSUE_MESSAGES[contentGuard.issue]);
    }

    const authorGuard = auditMarkdown(author, guardOptions);
    if (!authorGuard.ok && authorGuard.issue) {
      return await reject(`昵称${ISSUE_MESSAGES[authorGuard.issue]}`);
    }

    // 第三、四道：本地规则 → AI（AI 拿不准 → 待审）
    const verdict = await reviewComment(env, cfg, { author, content });

    if (verdict.verdict === 'block') {
      return await reject(verdict.reason || '内容不合规');
    }

    if (verdict.verdict === 'review') {
      return await acceptPending(verdict.reason || '待人工审核');
    }

    const status: CommentStatus = 'visible';
    const comment = await appendComment(env, slug, {
      author,
      content,
      status,
      deviceId,
      ipHash: ipHash ?? undefined,
      maxRejected: cfg.maxRejectedPerPost,
    });

    await safeRecord();

    return json({ ok: true, status, comment: publicComment(comment) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交失败';
    const isValidation =
      message.includes('长度') || message.includes('上限') || message.includes('为空');
    return json(
      { error: message, code: isValidation ? 'INVALID' : 'SERVER' },
      isValidation ? 400 : 502
    );
  }
};
