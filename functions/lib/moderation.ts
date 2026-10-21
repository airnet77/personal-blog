/**
 * 评论台账：按「设备」记录行为，用于每日配额、违规累计、自动封禁。
 *
 * 数据存仓库 comments/_moderation.json。文件里不放明文 IP，只有 8 位哈希。
 * 台账是尽力而为的软限制（并发写可能有极小误差），不作为安全边界。
 */
import type { Env } from './github';
import { mutateJson, readJson, writeJson } from './json-store';
import type { CommentConfig } from './comment-config';

const LEDGER_PATH = 'comments/_moderation.json';
const MAX_DEVICES = 2000;
const MAX_IP_HASHES = 5;
const MAX_STRIKES_KEPT = 5;
const MAX_RECENT_COMMENTS = 20;

export interface StrikeEntry {
  at: number;
  reason: string;
  slug: string;
}

export interface DeviceRecord {
  firstSeen: number;
  lastSeen: number;
  /** 历史总提交次数（含被拒） */
  total: number;
  /** 配额统计日：YYYY-MM-DD（Asia/Shanghai） */
  day: string;
  /** 当日提交次数 */
  dayCount: number;
  strikes: number;
  /** 0 表示未封禁；否则为解封时间戳 */
  blockedUntil: number;
  ipHashes: string[];
  recentStrikes: StrikeEntry[];
  /** 最近提交时间戳，用于分钟级频率限制 */
  recentComments: number[];
  lastAuthor: string;
}

export interface Ledger {
  version: number;
  devices: Record<string, DeviceRecord>;
}

export interface AllowedResult {
  ok: true;
}

export interface DeniedResult {
  ok: false;
  code: 403 | 429;
  message: string;
}

/** 以北京时间切日，避免 UTC 与用户感知错位 */
export function todayKey(now = Date.now()): string {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function emptyRecord(now: number, author: string): DeviceRecord {
  return {
    firstSeen: now,
    lastSeen: now,
    total: 0,
    day: todayKey(now),
    dayCount: 0,
    strikes: 0,
    blockedUntil: 0,
    ipHashes: [],
    recentStrikes: [],
    recentComments: [],
    lastAuthor: author,
  };
}

function normalizeLedger(input: unknown): Ledger {
  const raw = (input ?? {}) as Partial<Ledger>;
  const devices: Record<string, DeviceRecord> = {};

  for (const [id, value] of Object.entries(raw.devices ?? {})) {
    const rec = value as Partial<DeviceRecord>;
    if (!rec || typeof rec !== 'object') continue;

    devices[id] = {
      firstSeen: Number(rec.firstSeen) || 0,
      lastSeen: Number(rec.lastSeen) || 0,
      total: Number(rec.total) || 0,
      day: typeof rec.day === 'string' ? rec.day : todayKey(),
      dayCount: Number(rec.dayCount) || 0,
      strikes: Number(rec.strikes) || 0,
      blockedUntil: Number(rec.blockedUntil) || 0,
      ipHashes: Array.isArray(rec.ipHashes)
        ? rec.ipHashes.filter((x): x is string => typeof x === 'string').slice(0, MAX_IP_HASHES)
        : [],
      recentStrikes: Array.isArray(rec.recentStrikes)
        ? rec.recentStrikes
            .filter((x): x is StrikeEntry => Boolean(x) && typeof x === 'object')
            .slice(-MAX_STRIKES_KEPT)
        : [],
      recentComments: Array.isArray(rec.recentComments)
        ? rec.recentComments
            .filter((x): x is number => typeof x === 'number')
            .slice(-MAX_RECENT_COMMENTS)
        : [],
      lastAuthor: typeof rec.lastAuthor === 'string' ? rec.lastAuthor : '',
    };
  }

  return { version: 1, devices };
}

/** 读取台账；损坏或不存在都视为空台账 */
export async function loadLedger(env: Env): Promise<Ledger> {
  try {
    const { data } = await readJson<unknown>(env, LEDGER_PATH);
    return normalizeLedger(data);
  } catch {
    return { version: 1, devices: {} };
  }
}

/** 设备太多时按最近活跃时间淘汰，防止单文件无限膨胀 */
function pruneLedger(ledger: Ledger): void {
  const entries = Object.entries(ledger.devices);
  if (entries.length <= MAX_DEVICES) return;

  entries
    .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
    .slice(0, entries.length - MAX_DEVICES)
    .forEach(([id]) => {
      delete ledger.devices[id];
    });
}

function lockedMessage(blockedUntil: number): string {
  const d = new Date(blockedUntil);
  const text = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `该设备已被禁止评论（至 ${text}）`;
}

/**
 * 发送前检查：封禁 → 每日配额 → 分钟级频率 → IP 维度日限。
 * 只读台账，不产生写入。
 */
export async function checkPostAllowed(
  env: Env,
  cfg: CommentConfig,
  deviceId: string,
  ipHash: string | null
): Promise<AllowedResult | DeniedResult> {
  const ledger = await loadLedger(env);
  const now = Date.now();
  const today = todayKey(now);
  const record = ledger.devices[deviceId];

  if (record && record.blockedUntil > now) {
    return { ok: false, code: 403, message: lockedMessage(record.blockedUntil) };
  }

  const dayCount = record && record.day === today ? record.dayCount : 0;
  if (dayCount >= cfg.dailyLimit) {
    return {
      ok: false,
      code: 429,
      message: `今天的评论次数已用完（每台设备每天最多 ${cfg.dailyLimit} 条）`,
    };
  }

  const windowStart = now - cfg.burstWindowSec * 1000;
  const recent = (record?.recentComments ?? []).filter((t) => t > windowStart);
  if (recent.length >= cfg.burstLimit) {
    return {
      ok: false,
      code: 429,
      message: `发送太频繁，请 ${cfg.burstWindowSec} 秒后再试`,
    };
  }

  if (ipHash) {
    let ipCount = 0;
    for (const rec of Object.values(ledger.devices)) {
      if (rec.day === today && rec.ipHashes.includes(ipHash)) ipCount += rec.dayCount;
    }
    if (ipCount >= cfg.perIpDaily) {
      return {
        ok: false,
        code: 429,
        message: '当前网络今天的评论次数已达上限，请明天再试',
      };
    }
  }

  return { ok: true };
}

export interface RecordInput {
  deviceId: string;
  ipHash: string | null;
  author: string;
  slug: string;
  /** 有值表示本次提交被判违规 */
  strikeReason?: string;
}

export interface RecordResult {
  strikes: number;
  blockedUntil: number;
}

/**
 * 记一次提交（无论通过、待审还是被判违规）。
 * 违规时额外累加 strikes，达到阈值自动封禁。
 */
export async function recordOutcome(
  env: Env,
  cfg: CommentConfig,
  input: RecordInput
): Promise<RecordResult> {
  const now = Date.now();
  const today = todayKey(now);
  let result: RecordResult = { strikes: 0, blockedUntil: 0 };

  await mutateJson<Ledger, void>(env, LEDGER_PATH, (current) => {
    const ledger = normalizeLedger(current);
    const record = ledger.devices[input.deviceId] ?? emptyRecord(now, input.author);

    record.lastSeen = now;
    record.lastAuthor = input.author;
    record.total += 1;

    if (record.day !== today) {
      record.day = today;
      record.dayCount = 0;
    }
    record.dayCount += 1;

    record.recentComments = [...record.recentComments, now].slice(-MAX_RECENT_COMMENTS);

    if (input.ipHash && !record.ipHashes.includes(input.ipHash)) {
      record.ipHashes = [...record.ipHashes, input.ipHash].slice(-MAX_IP_HASHES);
    }

    if (input.strikeReason) {
      record.strikes += 1;
      record.recentStrikes = [
        ...record.recentStrikes,
        { at: now, reason: input.strikeReason, slug: input.slug },
      ].slice(-MAX_STRIKES_KEPT);

      if (cfg.autoBlock && record.strikes >= cfg.strikeLimit && record.blockedUntil <= now) {
        record.blockedUntil = now + cfg.blockDays * 24 * 3600 * 1000;
      }
    }

    ledger.devices[input.deviceId] = record;
    pruneLedger(ledger);

    result = { strikes: record.strikes, blockedUntil: record.blockedUntil };
    return { changed: true, next: ledger, result: undefined };
  });

  return result;
}

export interface DeviceView {
  deviceId: string;
  shortId: string;
  firstSeen: number;
  lastSeen: number;
  total: number;
  todayCount: number;
  strikes: number;
  blockedUntil: number;
  blocked: boolean;
  ipHashes: string[];
  recentStrikes: StrikeEntry[];
  lastAuthor: string;
}

/** 管理端列表：按最近活跃倒序 */
export async function listDevices(env: Env): Promise<DeviceView[]> {
  const ledger = await loadLedger(env);
  const today = todayKey();
  const now = Date.now();

  return Object.entries(ledger.devices)
    .map(([deviceId, rec]) => ({
      deviceId,
      shortId: deviceId.slice(0, 8),
      firstSeen: rec.firstSeen,
      lastSeen: rec.lastSeen,
      total: rec.total,
      todayCount: rec.day === today ? rec.dayCount : 0,
      strikes: rec.strikes,
      blockedUntil: rec.blockedUntil,
      blocked: rec.blockedUntil > now,
      ipHashes: rec.ipHashes,
      recentStrikes: rec.recentStrikes,
      lastAuthor: rec.lastAuthor,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

type LedgerAction = 'block' | 'unblock' | 'clear' | 'delete';

/** 管理端操作：封禁 / 解封 / 清零违规 / 删除档案 */
export async function updateDevice(
  env: Env,
  deviceId: string,
  action: LedgerAction,
  days = 7
): Promise<void> {
  const now = Date.now();

  if (action === 'delete') {
    await mutateJson<Ledger, void>(env, LEDGER_PATH, (current) => {
      const ledger = normalizeLedger(current);
      if (!ledger.devices[deviceId]) return { changed: false, result: undefined };
      delete ledger.devices[deviceId];
      return { changed: true, next: ledger, result: undefined };
    });
    return;
  }

  await mutateJson<Ledger, void>(env, LEDGER_PATH, (current) => {
    const ledger = normalizeLedger(current);
    const record = ledger.devices[deviceId];
    if (!record) throw new Error('设备不存在');

    if (action === 'block') {
      const span = Math.max(1, Math.min(3650, Math.round(days))) * 24 * 3600 * 1000;
      record.blockedUntil = now + span;
    } else if (action === 'unblock') {
      record.blockedUntil = 0;
    } else if (action === 'clear') {
      record.strikes = 0;
      record.recentStrikes = [];
      record.blockedUntil = 0;
    }

    return { changed: true, next: ledger, result: undefined };
  });
}

/** 清空台账（极端情况兜底，后台暂不暴露） */
export async function resetLedger(env: Env): Promise<void> {
  await writeJson(env, LEDGER_PATH, { version: 1, devices: {} }, null, 'chore: 重置评论台账');
}
