/**
 * 违禁词匹配：先做归一化，再做子串包含。
 *
 * 归一化能挡住这些低级绕过：
 *   「赌 博」「赌*博」「ＧＡＭＢＬＥ」「賭博」「赌.博」
 * 不处理拼音与谐音（那属于 AI 与人工审核的职责）。
 */
import { CATEGORIES, HARD_CATEGORIES, type Category } from './banned-words';

/** 常见繁体 → 简体，覆盖词表里出现过的字 */
const TRAD_TO_SIMP: Record<string, string> = {
  黨: '党',
  國: '国',
  會: '会',
  賭: '赌',
  黃: '黄',
  賣: '卖',
  藥: '药',
  騙: '骗',
  錢: '钱',
  惡: '恶',
  蕩: '荡',
  殺: '杀',
  搶: '抢',
  槍: '枪',
  詐: '诈',
  貸: '贷',
  廠: '厂',
  網: '网',
  點: '点',
  鏈: '链',
  結: '结',
  銀: '银',
  鐵: '铁',
  醫: '医',
  財: '财',
  產: '产',
  權: '权',
  眾: '众',
  舉: '举',
  選: '选',
  戰: '战',
  鬥: '斗',
  爭: '争',
  亂: '乱',
  興: '兴',
  團: '团',
  議: '议',
  員: '员',
  軍: '军',
  隊: '队',
  師: '师',
  導: '导',
  彈: '弹',
  殘: '残',
  滅: '灭',
  癮: '瘾',
};

/** 归一化：仅保留字母与数字，全部小写 */
export function normalizeForMatch(input: string): string {
  let text = String(input ?? '').normalize('NFKC').toLowerCase();
  text = text.replace(
    /[\u3400-\u9fff\uf900-\ufaff]/g,
    (ch) => TRAD_TO_SIMP[ch] ?? ch
  );
  return text.replace(/[^\p{L}\p{N}]+/gu, '');
}

/** 在文本里找命中词；词表为空返回空数组 */
export function findHits(text: string, words: string[]): string[] {
  const haystack = normalizeForMatch(text);
  if (!haystack) return [];

  const hits: string[] = [];
  for (const word of words) {
    const needle = normalizeForMatch(word);
    if (!needle) continue;
    if (haystack.includes(needle)) hits.push(word);
  }
  return hits;
}

export interface WordListState {
  categories: Record<Category, { enabled: boolean; words: string[] }>;
}

export interface BannedHit {
  category: Category;
  word: string;
  hard: boolean;
}

/**
 * 检查文本是否命中违禁词。
 * 按 CATEGORIES 顺序返回第一个命中的分类（涉政排最前，优先级最高）。
 */
export function checkBannedWords(text: string, list: WordListState): BannedHit | null {
  for (const category of CATEGORIES) {
    const entry = list.categories?.[category];
    if (!entry || entry.enabled === false) continue;

    const hits = findHits(text, entry.words ?? []);
    if (hits.length > 0) {
      return {
        category,
        word: hits[0],
        hard: HARD_CATEGORIES.includes(category),
      };
    }
  }

  return null;
}
