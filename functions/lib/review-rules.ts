/**
 * 本地审核规则：不依赖任何外部服务，负责挡住最明显的灌水与垃圾评论。
 * 这一层永远先跑，跑在 AI 之前 —— 省调用、也避免 AI 被话术带偏。
 */
import type { CommentConfig } from './comment-config';

export type Verdict = 'pass' | 'review' | 'block';

export interface ReviewResult {
  verdict: Verdict;
  reason: string;
  source: 'rules' | 'ai' | 'fallback';
}

export interface ReviewInput {
  author: string;
  content: string;
}

function block(reason: string): ReviewResult {
  return { verdict: 'block', reason, source: 'rules' };
}

function review(reason: string): ReviewResult {
  return { verdict: 'review', reason, source: 'rules' };
}

function pass(reason = '规则通过'): ReviewResult {
  return { verdict: 'pass', reason, source: 'rules' };
}

/** 只做确定的事：命中即拦，拿不准就交给 AI 或人工 */
export function rulesReview(_cfg: CommentConfig, input: ReviewInput): ReviewResult {
  const content = String(input.content ?? '').trim();
  const author = String(input.author ?? '').trim();
  const compact = content.replace(/\s+/g, '');

  if (compact.length < 2) return block('内容太短');

  // 同一字符连续 9 次以上：刷屏
  if (/(.)\1{8,}/u.test(compact)) return block('疑似刷屏');

  // 单一字符占比过高
  const counts = new Map<string, number>();
  for (const ch of compact) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  if (compact.length >= 12 && maxCount / compact.length > 0.6) return block('疑似刷屏');

  // 一个文字都没有（纯符号或纯表情）
  if (!/[\p{L}\p{N}]/u.test(compact)) return block('缺少文字内容');

  // 兜底：即便格式开关被放开，链接过多也拦
  const urlCount = content.match(/https?:\/\//gi)?.length ?? 0;
  if (urlCount > 3) return block('链接过多');

  // 同一短语重复 4 次以上
  if (/(.{2,8})\1{3,}/u.test(compact)) return review('内容大量重复');

  // 长串大写（典型垃圾广告特征）
  const upper = compact.match(/[A-Z]{12,}/g);
  if (upper && upper.join('').length > compact.length * 0.6) return review('疑似垃圾信息');

  // 昵称里出现邮箱
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(author)) return review('昵称疑似联系方式');

  // 昵称与正文完全相同
  if (compact.length > 4 && compact === author.replace(/\s+/g, '')) return review('昵称与内容重复');

  return pass();
}
