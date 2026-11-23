import { isValidISODate } from '../shared/dates';

export const STATUSES = ['New', 'Triaged', 'Planned', 'In progress', 'Done', 'Won’t do'] as const;
export type Status = (typeof STATUSES)[number];
export const CATEGORIES = ['Bug', 'Feature request', 'Usability', 'Performance', 'Content', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const SOURCES = ['Support ticket', 'Email', 'User interview', 'Survey', 'App review', 'Sales call', 'Internal'] as const;
export type Source = (typeof SOURCES)[number];

export interface Mention {
  date: string;
  source: Source;
  who: string;
  quote: string;
}

export interface Reply {
  date: string;
  text: string;
}

export interface Item {
  id: string;
  title: string;
  detail: string;
  category: Category;
  status: Status;
  mentions: Mention[];
  /** RICE inputs, set during triage. */
  reach: number | null; // people affected per quarter
  impact: number | null; // 0.25, 0.5, 1, 2, 3
  confidence: number | null; // 0.5, 0.8, 1
  effort: number | null; // person-weeks
  replies: Reply[];
  tags: string[];
  demo?: boolean;
}

export const IMPACT = [
  [3, 'Massive (3)'],
  [2, 'High (2)'],
  [1, 'Medium (1)'],
  [0.5, 'Low (0.5)'],
  [0.25, 'Minimal (0.25)'],
] as const;
export const CONFIDENCE = [
  [1, 'High (100%)'],
  [0.8, 'Medium (80%)'],
  [0.5, 'Low (50%)'],
] as const;

export function rice(i: Pick<Item, 'reach' | 'impact' | 'confidence' | 'effort'>): number | null {
  if (i.reach == null || i.impact == null || i.confidence == null || !i.effort) return null;
  return Math.round(((i.reach * i.impact * i.confidence) / i.effort) * 10) / 10;
}

export const isScored = (i: Item) => rice(i) != null;
export const isOpen = (i: Item) => i.status !== 'Done' && i.status !== 'Won’t do';

/** Quick-win / big-bet / fill-in / money-pit, using impact ≥ 1 as "high" and effort ≤ 2 weeks as "low". */
export function quadrant(i: Item): 'Quick win' | 'Big bet' | 'Fill-in' | 'Money pit' | null {
  if (i.impact == null || i.effort == null) return null;
  const hi = i.impact >= 1, cheap = i.effort <= 2;
  return hi && cheap ? 'Quick win' : hi ? 'Big bet' : cheap ? 'Fill-in' : 'Money pit';
}

const STOP = new Set(['the', 'and', 'for', 'with', 'when', 'that', 'this', 'from', 'into', 'have', 'cant', 'can’t', 'not', 'are', 'its', 'it’s', 'too', 'our', 'your', 'you']);
export function words(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

/** Jaccard similarity of meaningful title words. */
export function similarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export function similarItems(title: string, items: Item[], excludeId?: string, threshold = 0.25): { item: Item; score: number }[] {
  return items
    .filter((i) => i.id !== excludeId)
    .map((item) => ({ item, score: similarity(title, item.title) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/** Merges `dupe` into `keep`: mentions, replies and tags are combined; keep's fields win. */
export function merge(keep: Item, dupe: Item): Item {
  return {
    ...keep,
    detail: keep.detail || dupe.detail,
    mentions: [...keep.mentions, ...dupe.mentions].sort((a, b) => a.date.localeCompare(b.date)),
    replies: [...keep.replies, ...dupe.replies].sort((a, b) => a.date.localeCompare(b.date)),
    tags: [...new Set([...keep.tags, ...dupe.tags])],
    demo: keep.demo && dupe.demo,
  };
}

export function lastMention(i: Item): string {
  return i.mentions.reduce((m, x) => (x.date > m ? x.date : m), '');
}

export function countBy<T extends string>(items: Item[], key: (i: Item) => T, keys: readonly T[]) {
  return keys.map((k) => ({ key: k, count: items.filter((i) => key(i) === k).length }));
}

export function validateItem(d: { title: string; date: string; who: string }) {
  const e: Partial<Record<'title' | 'date' | 'who', string>> = {};
  if (!d.title.trim()) e.title = 'Summarise the feedback in a short title.';
  else if (d.title.trim().length > 120) e.title = 'Keep the title under 120 characters.';
  if (!isValidISODate(d.date)) e.date = 'Choose when it was received.';
  return e;
}

export function validateScore(d: { reach: string; effort: string }) {
  const e: Partial<Record<'reach' | 'effort', string>> = {};
  const r = Number(d.reach), ef = Number(d.effort);
  if (!d.reach.trim() || !Number.isFinite(r) || r < 0) e.reach = 'Estimate how many people it affects (0 or more).';
  if (!d.effort.trim() || !Number.isFinite(ef) || ef <= 0) e.effort = 'Effort must be more than 0 person-weeks.';
  return e;
}

export const CSV_HEADERS = ['Title', 'Category', 'Status', 'Mentions', 'Last mentioned', 'Reach', 'Impact', 'Confidence', 'Effort (weeks)', 'RICE', 'Tags'];
export const csvRows = (items: Item[]) => items.map((i) => [i.title, i.category, i.status, String(i.mentions.length), lastMention(i), i.reach ?? '', i.impact ?? '', i.confidence ?? '', i.effort ?? '', rice(i) ?? '', i.tags.join(' ')].map(String));
