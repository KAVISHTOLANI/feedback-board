import { describe, expect, it } from 'vitest';
import { countBy, csvRows, isOpen, lastMention, merge, quadrant, rice, similarItems, similarity, validateItem, validateScore, STATUSES, type Item } from './feedback';

const it_ = (p: Partial<Item>): Item => ({ id: Math.random().toString(), title: 'T', detail: '', category: 'Bug', status: 'New', mentions: [], reach: null, impact: null, confidence: null, effort: null, replies: [], tags: [], ...p });

describe('scoring', () => {
  it('computes RICE only when all inputs are present', () => {
    expect(rice(it_({ reach: 500, impact: 2, confidence: 0.8, effort: 4 }))).toBe(200);
    expect(rice(it_({ reach: 500, impact: 2, confidence: 0.8, effort: 0 }))).toBeNull();
    expect(rice(it_({ reach: 500, impact: null, confidence: 0.8, effort: 1 }))).toBeNull();
  });
  it('places items in impact/effort quadrants', () => {
    expect(quadrant(it_({ impact: 2, effort: 1 }))).toBe('Quick win');
    expect(quadrant(it_({ impact: 3, effort: 6 }))).toBe('Big bet');
    expect(quadrant(it_({ impact: 0.5, effort: 2 }))).toBe('Fill-in');
    expect(quadrant(it_({ impact: 0.25, effort: 8 }))).toBe('Money pit');
    expect(quadrant(it_({}))).toBeNull();
  });
  it('knows which items are still open', () => {
    expect(STATUSES.map((s) => isOpen(it_({ status: s })))).toEqual([true, true, true, true, false, false]);
  });
});

describe('duplicates', () => {
  it('scores title similarity on meaningful words', () => {
    expect(similarity('Export to CSV is broken', 'CSV export broken on Safari')).toBe(0.75);
    expect(similarity('Dark mode', 'Faster search')).toBe(0);
    expect(similarity('the and', 'for you')).toBe(0);
  });
  it('finds similar items above a threshold, best first', () => {
    const a = it_({ id: 'a', title: 'CSV export fails for large files' });
    const b = it_({ id: 'b', title: 'Add dark mode' });
    const c = it_({ id: 'c', title: 'Export to CSV times out' });
    expect(similarItems('CSV export times out', [a, b, c]).map((x) => x.item.id)).toEqual(['c', 'a']);
  });
  it('merges mentions, replies and tags in date order', () => {
    const keep = it_({ mentions: [{ date: '2026-11-10', source: 'Email', who: 'A', quote: 'x' }], tags: ['export'] });
    const dupe = it_({ detail: 'More detail', mentions: [{ date: '2026-11-01', source: 'Survey', who: 'B', quote: 'y' }], replies: [{ date: '2026-11-02', text: 'Thanks' }], tags: ['export', 'csv'] });
    const m = merge(keep, dupe);
    expect(m.mentions.map((x) => x.who)).toEqual(['B', 'A']);
    expect(m.tags).toEqual(['export', 'csv']);
    expect(m.detail).toBe('More detail');
    expect(m.replies).toHaveLength(1);
    expect(lastMention(m)).toBe('2026-11-10');
  });
});

describe('reporting and validation', () => {
  it('counts by status', () => {
    expect(countBy([it_({ status: 'New' }), it_({ status: 'New' }), it_({ status: 'Done' })], (i) => i.status, STATUSES).filter((x) => x.count)).toEqual([{ key: 'New', count: 2 }, { key: 'Done', count: 1 }]);
  });
  it('writes CSV rows with RICE', () => {
    expect(csvRows([it_({ title: 'A', reach: 100, impact: 1, confidence: 1, effort: 2 })])[0]).toEqual(['A', 'Bug', 'New', '0', '', '100', '1', '1', '2', '50', '']);
  });
  it('validates new feedback and scores', () => {
    expect(validateItem({ title: '', date: 'x', who: '' })).toEqual({ title: expect.any(String), date: expect.any(String) });
    expect(validateScore({ reach: '-1', effort: '0' })).toEqual({ reach: expect.any(String), effort: expect.any(String) });
  });
});
