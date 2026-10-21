/**
 * 评论功能的全部开关与数值参数。
 *
 * 默认值写在这里；后台改的值存到仓库 comments/_config.json，
 * 读取时逐字段校验（坏值回落默认），保证配置损坏也不会把评论功能弄挂。
 */
import type { Env } from './github';
import { readJson, writeJson } from './json-store';

const CONFIG_PATH = 'comments/_config.json';
const CACHE_TTL_MS = 60_000;

export interface CommentConfig {
  /** 评论总开关 */
  enabled: boolean;
  maxAuthor: number;
  maxLength: number;
  /** 同一设备每天最多发多少条 */
  dailyLimit: number;
  /** 同一设备 burstWindowSec 秒内最多发多少条 */
  burstLimit: number;
  burstWindowSec: number;
  /** 同一 IP 每天最多发多少条 */
  perIpDaily: number;
  /** 前台默认显示条数 */
  pageSize: number;
  /** 单条超过多少字折叠 */
  collapseChars: number;
  /** 是否记录 IP 哈希（关闭后 IP 维度配额也失效） */
  recordIp: boolean;
  /** 违禁词命中后：直接拒 / 转待审 */
  wordListMode: 'block' | 'review';
  allowLinks: boolean;
  allowImages: boolean;
  allowHtml: boolean;
  /** off=不审；rules=只跑本地规则；ai=规则 + AI */
  reviewMode: 'off' | 'rules' | 'ai';
  aiModel: string;
  /** AI 不可用时：放行 / 转待审 */
  aiFallback: 'publish' | 'pending';
  /** 违规累计到阈值自动封禁 */
  autoBlock: boolean;
  strikeLimit: number;
  blockDays: number;
  /** 违规评论是否留档（后台可见，前台永不展示） */
  keepRejected: boolean;
  /** 每篇文章最多保留多少条违规记录 */
  maxRejectedPerPost: number;
}

export const DEFAULT_CONFIG: CommentConfig = {
  enabled: true,
  maxAuthor: 30,
  maxLength: 1000,
  dailyLimit: 50,
  burstLimit: 5,
  burstWindowSec: 60,
  perIpDaily: 100,
  pageSize: 10,
  collapseChars: 280,
  recordIp: true,
  wordListMode: 'block',
  allowLinks: false,
  allowImages: false,
  allowHtml: false,
  reviewMode: 'ai',
  aiModel: '@cf/meta/llama-3.1-8b-instruct',
  aiFallback: 'pending',
  autoBlock: true,
  strikeLimit: 3,
  blockDays: 7,
  keepRejected: true,
  maxRejectedPerPost: 200,
};

let cache: { at: number; value: CommentConfig } | null = null;

export function invalidateConfigCache(): void {
  cache = null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function text(value: unknown, fallback: string, maxLength = 100): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || fallback;
}

/** 逐字段校验。任何非法值都回落到默认值，绝不抛错 */
export function sanitizeConfig(input: unknown): CommentConfig {
  const raw = (input ?? {}) as Record<string, unknown>;

  return {
    enabled: bool(raw.enabled, DEFAULT_CONFIG.enabled),
    maxAuthor: clampInt(raw.maxAuthor, DEFAULT_CONFIG.maxAuthor, 1, 50),
    maxLength: clampInt(raw.maxLength, DEFAULT_CONFIG.maxLength, 10, 5000),
    dailyLimit: clampInt(raw.dailyLimit, DEFAULT_CONFIG.dailyLimit, 1, 500),
    burstLimit: clampInt(raw.burstLimit, DEFAULT_CONFIG.burstLimit, 1, 100),
    burstWindowSec: clampInt(raw.burstWindowSec, DEFAULT_CONFIG.burstWindowSec, 5, 3600),
    perIpDaily: clampInt(raw.perIpDaily, DEFAULT_CONFIG.perIpDaily, 1, 2000),
    pageSize: clampInt(raw.pageSize, DEFAULT_CONFIG.pageSize, 1, 100),
    collapseChars: clampInt(raw.collapseChars, DEFAULT_CONFIG.collapseChars, 50, 5000),
    recordIp: bool(raw.recordIp, DEFAULT_CONFIG.recordIp),
    wordListMode: pickOne(raw.wordListMode, ['block', 'review'] as const, DEFAULT_CONFIG.wordListMode),
    allowLinks: bool(raw.allowLinks, DEFAULT_CONFIG.allowLinks),
    allowImages: bool(raw.allowImages, DEFAULT_CONFIG.allowImages),
    allowHtml: bool(raw.allowHtml, DEFAULT_CONFIG.allowHtml),
    reviewMode: pickOne(raw.reviewMode, ['off', 'rules', 'ai'] as const, DEFAULT_CONFIG.reviewMode),
    aiModel: text(raw.aiModel, DEFAULT_CONFIG.aiModel),
    aiFallback: pickOne(raw.aiFallback, ['publish', 'pending'] as const, DEFAULT_CONFIG.aiFallback),
    autoBlock: bool(raw.autoBlock, DEFAULT_CONFIG.autoBlock),
    strikeLimit: clampInt(raw.strikeLimit, DEFAULT_CONFIG.strikeLimit, 1, 20),
    blockDays: clampInt(raw.blockDays, DEFAULT_CONFIG.blockDays, 0, 3650),
    keepRejected: bool(raw.keepRejected, DEFAULT_CONFIG.keepRejected),
    maxRejectedPerPost: clampInt(
      raw.maxRejectedPerPost,
      DEFAULT_CONFIG.maxRejectedPerPost,
      0,
      2000
    ),
  };
}

/** 读取配置（60 秒缓存）。读失败用默认值 */
export async function loadConfig(env: Env): Promise<CommentConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const { data } = await readJson<unknown>(env, CONFIG_PATH);
    const value = sanitizeConfig(data);
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 保存配置（与现有值合并），成功后立即刷新缓存 */
export async function saveConfig(env: Env, patch: unknown): Promise<CommentConfig> {
  const { data, sha } = await readJson<unknown>(env, CONFIG_PATH);
  const current = sanitizeConfig(data);
  const merged = sanitizeConfig({ ...current, ...(patch as Record<string, unknown>) });

  await writeJson(env, CONFIG_PATH, merged, sha, 'chore: 更新评论配置');
  cache = { at: Date.now(), value: merged };
  return merged;
}
