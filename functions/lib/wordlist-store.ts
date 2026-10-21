/**
 * 违禁词表的读取 / 保存。
 *
 * 词表是「运行时可改」的数据：后台保存后写入仓库 comments/_wordlist.json，
 * 服务端读取时与内置默认值合并（文件缺失或某个分类缺字段就用默认补上）。
 */
import type { Env } from './github';
import { readJson, writeJson } from './json-store';
import { CATEGORIES, DEFAULT_WORDLIST, type Category } from './banned-words';
import type { WordListState } from './word-filter';

const WORDLIST_PATH = 'comments/_wordlist.json';
const CACHE_TTL_MS = 60_000;

interface WordListFile {
  version?: number;
  categories?: Record<string, { enabled?: boolean; words?: unknown }>;
}

let cache: { at: number; value: WordListState } | null = null;

export function invalidateWordListCache(): void {
  cache = null;
}

/** 单类最多词数 / 单个词最长字符数 */
const MAX_WORDS_PER_CATEGORY = 500;
const MAX_WORD_LENGTH = 20;

function defaultState(): WordListState {
  const categories = {} as WordListState['categories'];
  for (const category of CATEGORIES) {
    categories[category] = {
      enabled: true,
      words: [...DEFAULT_WORDLIST[category]],
    };
  }
  return { categories };
}

function normalizeWords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const words: string[] = [];

  for (const item of input) {
    if (typeof item !== 'string') continue;
    const word = item.trim().slice(0, MAX_WORD_LENGTH);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= MAX_WORDS_PER_CATEGORY) break;
  }

  return words;
}

/** 把仓库里的原始数据整理成可用的词表；坏数据逐类回落默认 */
export function sanitizeWordList(input: unknown): WordListState {
  const state = defaultState();
  const source = (input ?? {}) as WordListFile;
  const raw = source.categories ?? {};

  for (const category of CATEGORIES) {
    const entry = raw[category];
    if (!entry || typeof entry !== 'object') continue;

    const enabled =
      typeof (entry as { enabled?: unknown }).enabled === 'boolean'
        ? ((entry as { enabled?: boolean }).enabled as boolean)
        : true;

    const words = Array.isArray((entry as { words?: unknown }).words)
      ? normalizeWords((entry as { words?: unknown }).words)
      : [];

    state.categories[category] = { enabled, words };
  }

  return state;
}

/** 读取词表（60 秒缓存）。读失败时用默认词表，保证审核链永远可用 */
export async function loadWordList(env: Env): Promise<WordListState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const { data } = await readJson<WordListFile>(env, WORDLIST_PATH);
    const value = sanitizeWordList(data);
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return defaultState();
  }
}

/** 保存词表（全量覆盖），成功后立即刷新缓存 */
export async function saveWordList(env: Env, input: unknown): Promise<WordListState> {
  const value = sanitizeWordList(input);
  const { sha } = await readJson<WordListFile>(env, WORDLIST_PATH);

  await writeJson(
    env,
    WORDLIST_PATH,
    { version: 1, categories: value.categories },
    sha,
    'chore: 更新评论违禁词表'
  );

  cache = { at: Date.now(), value };
  return value;
}

/** 恢复内置默认词表 */
export function resetWordList(): WordListState {
  return defaultState();
}

export type { Category };
