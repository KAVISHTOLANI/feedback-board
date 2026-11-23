import { useMemo, useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DataTable, useTable, type Column } from './shared/table';
import { toCSV } from './shared/csv';
import { addDays, formatDay, todayISO } from './shared/dates';
import { CATEGORIES, CONFIDENCE, CSV_HEADERS, IMPACT, SOURCES, STATUSES, countBy, csvRows, isOpen, lastMention, merge, quadrant, rice, similarItems, validateItem, validateScore, type Category, type Item, type Source, type Status } from './lib/feedback';

const KEY = 'signal-board:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/board', label: 'Board' },
  { to: '/priorities', label: 'Priorities' },
];
const CAT_COLOR: Record<Category, string> = { Bug: 'var(--err)', 'Feature request': 'var(--accent)', Usability: '#2f6aa3', Performance: '#b08a1e', Content: '#5b7f3a', Other: 'var(--muted)' };

interface Store {
  items: Item[];
}

export function demoItems(today: string): Item[] {
  const d = (n: number) => addDays(today, -n);
  const m = (days: number, source: Source, who: string, quote: string) => ({ date: d(days), source, who, quote });
  const x = (id: string, title: string, category: Category, status: Status, mentions: Item['mentions'], score: [number, number, number, number] | null, extra: Partial<Item> = {}): Item => ({ id: `demo-${id}`, title, detail: '', category, status, mentions, reach: score?.[0] ?? null, impact: score?.[1] ?? null, confidence: score?.[2] ?? null, effort: score?.[3] ?? null, replies: [], tags: [], demo: true, ...extra });
  return [
    x('csv', 'CSV export times out on large projects', 'Bug', 'Planned', [m(30, 'Support ticket', 'Customer A (demo)', 'Export spins forever with 10k rows.'), m(12, 'Email', 'Customer B (demo)', 'Can’t get my data out.'), m(4, 'Support ticket', 'Customer C (demo)', 'CSV export just stops.')], [900, 2, 1, 2], { tags: ['export'], replies: [{ date: d(11), text: 'Told Customer B a fix is planned for next month.' }] }),
    x('dark', 'Dark mode', 'Feature request', 'Triaged', [m(60, 'Survey', 'Survey respondent (demo)', 'Please add dark mode.'), m(20, 'App review', 'App review (demo)', 'Needs a dark theme for evening use.')], [2500, 0.5, 0.8, 6]),
    x('onb', 'New users can’t find where to invite teammates', 'Usability', 'In progress', [m(18, 'User interview', 'Interviewee 3 (demo)', 'I gave up looking for invites.'), m(9, 'User interview', 'Interviewee 5 (demo)', 'Where do I add my team?')], [1200, 2, 0.8, 1.5], { detail: 'Invite button is hidden in Settings → Members. Two of five interviewees missed it.' }),
    x('slow', 'Dashboard takes 6+ seconds to load on Monday mornings', 'Performance', 'Triaged', [m(14, 'Internal', 'On-call engineer (demo)', 'p95 load 6.4s at 9am Monday.')], [3000, 1, 0.5, 4]),
    x('sso', 'Single sign-on with the company identity provider', 'Feature request', 'New', [m(5, 'Sales call', 'Prospect (demo)', 'SSO is a must for procurement.')], null),
    x('typo', 'Typo on the pricing page: “anually”', 'Content', 'Done', [m(25, 'Email', 'Visitor (demo)', 'Small typo on pricing.')], [5000, 0.25, 1, 0.1]),
    x('pdf', 'Export reports to PDF with company logo, custom colours and a cover page for board meetings', 'Feature request', 'New', [m(3, 'Sales call', 'Customer D (demo)', 'Our board wants branded PDFs.')], null),
    x('notif', 'Too many email notifications', 'Usability', 'New', [m(2, 'Survey', 'Survey respondent (demo)', 'I get five emails a day.'), m(1, 'Support ticket', 'Customer E (demo)', 'How do I turn these emails off?')], null),
    x('csv2', 'CSV export times out with large files', 'Bug', 'New', [m(1, 'App review', 'App review (demo)', 'Export broken with big files.')], null),
    x('ie', 'Support for a browser that is no longer maintained', 'Other', 'Won’t do', [m(40, 'Email', 'Customer F (demo)', 'Please support our old browser.')], null, { replies: [{ date: d(38), text: 'Explained we only support current browsers.' }] }),
  ];
}

export default function App() {
  const [route, navigate] = useRoute();
  const today = todayISO();
  const [store, setStore] = usePersistentState<Store>(KEY, () => ({ items: demoItems(today) }));
  const ctx = { store, setStore, today, navigate };
  const view = route.match(/^\/item\/(.+)$/);
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/inbox') page = <Inbox {...ctx} />;
  else if (route === '/board') page = <Board {...ctx} />;
  else if (route === '/priorities') page = <Priorities {...ctx} />;
  else if (view) page = <Detail {...ctx} id={view[1]} />;
  else page = <NotFound />;
  return (
    <Shell name="Signal Board" wordmark={['Signal', 'Board']} nav={NAV} route={route} cta={{ to: '/inbox', label: 'Log feedback' }} footerNote="Feedback stays in this browser. Don’t store customers’ personal data you don’t need.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; today: string; navigate: (to: string) => void };

function CatTag({ c }: { c: Category }) {
  return <span className="cat-tag" style={{ ['--c' as string]: CAT_COLOR[c] }}>{c}</span>;
}

/* ---------- Impact / effort matrix ---------- */
export function Matrix({ items, compact }: { items: Item[]; compact?: boolean }) {
  const [focus, setFocus] = useState<Item | null>(null);
  const scored = items.filter((i) => i.impact != null && i.effort != null && isOpen(i));
  const maxEffort = Math.max(8, ...scored.map((i) => i.effort!));
  const W = 520, H = 320, L = 44, B = 34, T = 12, R = 12;
  const x = (e: number) => L + (Math.log2(e + 1) / Math.log2(maxEffort + 1)) * (W - L - R);
  const y = (im: number) => T + (1 - Math.log2(im * 4) / Math.log2(12)) * (H - T - B);
  const maxRice = Math.max(1, ...scored.map((i) => rice(i) ?? 0));
  return (
    <figure className="matrix">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Impact versus effort for ${scored.length} open, scored items. Top left are quick wins.`}>
        <rect x={L} y={T} width={x(2) - L} height={y(1) - T} className="q-win" />
        <text x={L + 6} y={T + 16} className="q-lbl">Quick wins</text>
        <text x={W - R - 6} y={T + 16} textAnchor="end" className="q-lbl">Big bets</text>
        <text x={L + 6} y={H - B - 8} className="q-lbl">Fill-ins</text>
        <text x={W - R - 6} y={H - B - 8} textAnchor="end" className="q-lbl">Money pits</text>
        <line x1={x(2)} x2={x(2)} y1={T} y2={H - B} className="q-div" />
        <line x1={L} x2={W - R} y1={y(1)} y2={y(1)} className="q-div" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis-line" />
        <line x1={L} x2={L} y1={T} y2={H - B} className="axis-line" />
        {[0.5, 1, 2, 4, 8].filter((e) => e <= maxEffort).map((e) => <text key={e} x={x(e)} y={H - B + 16} textAnchor="middle" className="ax">{e}</text>)}
        <text x={(W + L) / 2} y={H - 4} textAnchor="middle" className="ax">effort (person-weeks)</text>
        {IMPACT.map(([v]) => <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end" className="ax">{v}</text>)}
        <text x={12} y={(H - B) / 2} transform={`rotate(-90 12 ${(H - B) / 2})`} textAnchor="middle" className="ax">impact</text>
        {scored.map((i, n) => {
          const r = 6 + ((rice(i) ?? 0) / maxRice) * 12;
          return (
            <g key={i.id} transform={`translate(${x(i.effort!)},${y(i.impact!) + ((n % 3) - 1) * 6})`} className="dot" tabIndex={compact ? -1 : 0} role="img" aria-label={`${i.title}: impact ${i.impact}, effort ${i.effort} weeks, RICE ${rice(i) ?? 'not scored'}`}
              onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(i)} onBlur={() => setFocus(null)} style={{ ['--c' as string]: CAT_COLOR[i.category], ['--i' as string]: n }}>
              <circle r={r} />
            </g>
          );
        })}
      </svg>
      {!compact && <figcaption className="small" aria-live="polite">{focus ? <><strong>{focus.title}</strong> · {quadrant(focus)} · RICE {rice(focus) ?? '—'}</> : 'Bubble size = RICE score. Hover or focus a bubble for details.'}</figcaption>}
      {!compact && <p className="legend">{CATEGORIES.filter((c) => scored.some((i) => i.category === c)).map((c) => <span key={c}><i style={{ background: CAT_COLOR[c], borderRadius: '50%' }} />{c}</span>)}</p>}
    </figure>
  );
}

function HeroPreview() {
  const items = demoItems(todayISO());
  const counts = countBy(items, (i) => i.status, STATUSES).filter((c) => c.count);
  return (
    <div className="hero-sb">
      <div className="hero-sb-counts">{counts.map((c) => <span key={c.key}><b>{c.count}</b>{c.key}</span>)}</div>
      <Matrix items={items} compact />
    </div>
  );
}

function Home() {
  return (
    <Landing
      eyebrow="Product feedback board"
      title={<>Hear every signal. <em>Act on the strongest.</em></>}
      lead="Collect feedback from tickets, interviews, surveys and sales calls in one place. Spot duplicates as you type, score items with RICE, see quick wins on an impact/effort matrix, and keep a log of what you told customers."
      primary={{ href: '#/inbox', label: 'Open the inbox' }}
      secondary={{ href: '#/priorities', label: 'See priorities' }}
      previewLabel="Impact vs effort — demo backlog"
      preview={<HeroPreview />}
      steps={[
        { title: 'Capture', body: 'Log feedback with its source and a quote. If it sounds like something already logged, add it as another mention instead.' },
        { title: 'Triage', body: 'Categorise and score reach, impact, confidence and effort. RICE ranks the backlog for you.' },
        { title: 'Close the loop', body: 'Move items across the board and record what you told the people who asked.' },
      ]}
      stepsIntro="Signal Board opens with ten labelled, fictional feedback items at every stage — including a likely duplicate to merge."
      features={[
        { title: 'Duplicate detection', body: 'Similar titles are flagged while you type and can be merged, keeping every mention.' },
        { title: 'RICE scoring', body: 'Reach × impact × confidence ÷ effort, with the standard impact and confidence scales.' },
        { title: 'Impact/effort matrix', body: 'Quick wins, big bets, fill-ins and money pits at a glance, bubbles sized by score.' },
        { title: 'Response log', body: 'Every reply to a customer is dated, so nobody is promised the same thing twice.' },
      ]}
      note="Signal Board is a local planning tool. Avoid storing customers’ personal data you don’t need."
      closing={{ title: <>The loudest request <em>isn’t always the biggest.</em></>, action: { href: '#/inbox', label: 'Log feedback' } }}
    />
  );
}

/* ---------- Inbox ---------- */
function Inbox({ store, setStore, today, navigate }: Ctx) {
  const [flash, setFlash] = useFlash(5000);
  const [d, setD] = useState({ title: '', detail: '', category: 'Feature request' as Category, source: 'Support ticket' as Source, who: '', quote: '', date: today });
  const [submitted, setSubmitted] = useState(false);
  const errors = submitted ? validateItem(d) : {};
  const similar = d.title.trim().length > 4 ? similarItems(d.title, store.items).slice(0, 3) : [];
  const fresh = store.items.filter((i) => i.status === 'New').sort((a, b) => lastMention(b).localeCompare(lastMention(a)));
  const mention = () => ({ date: d.date, source: d.source, who: d.who.trim() || 'Unnamed', quote: d.quote.trim() || d.title.trim() });
  function add(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateItem(d)).length) return;
    setStore({ items: [{ id: uid('fb'), title: d.title.trim(), detail: d.detail.trim(), category: d.category, status: 'New', mentions: [mention()], reach: null, impact: null, confidence: null, effort: null, replies: [], tags: [] }, ...store.items] });
    setFlash({ kind: 'success', text: `Logged “${d.title.trim()}”.` });
    setD({ ...d, title: '', detail: '', who: '', quote: '' });
    setSubmitted(false);
  }
  function addMention(target: Item) {
    setStore({ items: store.items.map((i) => (i.id === target.id ? { ...i, mentions: [...i.mentions, mention()] } : i)) });
    setFlash({ kind: 'success', text: `Added as another mention of “${target.title}” (${target.mentions.length + 1} mentions).` });
    setD({ ...d, title: '', detail: '', who: '', quote: '' });
    setSubmitted(false);
  }
  return (
    <div className="stack">
      <PageHead eyebrow="Inbox" title={<>New <em>signals.</em></>} description={`${fresh.length} waiting for triage`} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <form className="card stack" onSubmit={add} noValidate aria-labelledby="log-t">
        <h2 id="log-t" className="h3">Log feedback</h2>
        <div className="form-grid">
          <Field label="Title" className="span-2" error={errors.title}>{(p) => <input {...p} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Export to CSV fails with big files" />}</Field>
          <Field label="Category">{(p) => <select {...p} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Source">{(p) => <select {...p} value={d.source} onChange={(e) => setD({ ...d, source: e.target.value as Source })}>{SOURCES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="From" hint="A role or account, not personal details">{(p) => <input {...p} value={d.who} onChange={(e) => setD({ ...d, who: e.target.value })} />}</Field>
          <Field label="Received" error={errors.date}>{(p) => <input {...p} type="date" max={today} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />}</Field>
        </div>
        <Field label="Quote" hint="Their words, if you have them">{(p) => <textarea {...p} rows={2} value={d.quote} onChange={(e) => setD({ ...d, quote: e.target.value })} />}</Field>
        {similar.length > 0 && (
          <div className="similar" role="region" aria-label="Possibly the same as">
            <p className="small"><strong>This might already be logged:</strong></p>
            <ul>{similar.map(({ item, score }) => <li key={item.id}><span><a href={`#/item/${item.id}`}>{item.title}</a> <span className="small muted">· {item.status} · {item.mentions.length} mention{item.mentions.length === 1 ? '' : 's'} · {Math.round(score * 100)}% match</span></span><button type="button" className="btn btn-sm" onClick={() => addMention(item)}>Add as a mention</button></li>)}</ul>
          </div>
        )}
        <div><button className="btn btn-primary" type="submit">Log as new item</button></div>
      </form>
      <section className="stack" aria-labelledby="tri-t">
        <h2 id="tri-t" className="h3">Waiting for triage</h2>
        {fresh.length === 0 ? <EmptyState title="Inbox zero" actions={<a className="btn" href="#/board">Go to the board</a>}>Everything new has been triaged.</EmptyState> : (
          <ul className="inbox">
            {fresh.map((i) => (
              <li key={i.id} className="card">
                <div className="row-between"><a href={`#/item/${i.id}`} className="in-title">{i.title}</a><CatTag c={i.category} /></div>
                <p className="small muted">{i.mentions.length} mention{i.mentions.length === 1 ? '' : 's'} · last {formatDay(lastMention(i), { day: 'numeric', month: 'short' })} via {i.mentions.at(-1)?.source}{i.demo && <> · <DemoTag /></>}</p>
                {i.mentions.at(-1)?.quote && <blockquote className="q">“{i.mentions.at(-1)!.quote}”</blockquote>}
                <div className="row"><button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(`/item/${i.id}`)}>Triage</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => setStore({ items: store.items.map((x) => (x.id === i.id ? { ...x, status: 'Won’t do' } : x)) })}>Won’t do</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {store.items.some((i) => i.demo) && <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStore({ items: store.items.filter((i) => !i.demo) }); setFlash({ kind: 'success', text: 'Demo feedback removed.' }); }}>Clear demo feedback</button></div>}
      {store.items.length === 0 && <button type="button" className="btn" onClick={() => setStore({ items: demoItems(today) })}>Load demo feedback</button>}
    </div>
  );
}

/* ---------- Detail ---------- */
function Detail({ store, setStore, today, navigate, id }: Ctx & { id: string }) {
  const item = store.items.find((i) => i.id === id);
  const [flash, setFlash] = useFlash();
  const [sc, setSc] = useState(() => ({ reach: item?.reach == null ? '' : String(item.reach), impact: String(item?.impact ?? 1), confidence: String(item?.confidence ?? 0.8), effort: item?.effort == null ? '' : String(item.effort) }));
  const [scErr, setScErr] = useState<ReturnType<typeof validateScore>>({});
  const [reply, setReply] = useState('');
  if (!item) return <EmptyState title="Item not found" actions={<a className="btn btn-primary" href="#/board">Back to the board</a>}>It may have been merged or deleted.</EmptyState>;
  const update = (patch: Partial<Item>) => setStore({ items: store.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) });
  const similar = similarItems(item.title, store.items, item.id).slice(0, 3);
  const preview = rice({ reach: Number(sc.reach), impact: Number(sc.impact), confidence: Number(sc.confidence), effort: Number(sc.effort) });
  function saveScore(e: React.FormEvent) {
    e.preventDefault();
    const err = validateScore(sc);
    setScErr(err);
    if (Object.keys(err).length) return;
    update({ reach: Number(sc.reach), impact: Number(sc.impact), confidence: Number(sc.confidence), effort: Number(sc.effort), status: item!.status === 'New' ? 'Triaged' : item!.status });
    setFlash({ kind: 'success', text: `Scored — RICE ${preview}.` });
  }
  return (
    <div className="stack">
      <PageHead eyebrow={<><a href="#/board">Board</a> / {item.status}</>} title={item.title} description={`${item.mentions.length} mention${item.mentions.length === 1 ? '' : 's'} · last ${formatDay(lastMention(item))}`}
        actions={<><select aria-label="Status" value={item.status} onChange={(e) => update({ status: e.target.value as Status })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select><button type="button" className="btn btn-danger" onClick={() => { if (window.confirm('Delete this feedback item?')) { setStore({ items: store.items.filter((i) => i.id !== item.id) }); navigate('/board'); } }}>Delete</button></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {item.demo && <p><DemoTag /> <span className="small muted">Fictional demo feedback.</span></p>}
      {similar.length > 0 && (
        <Notice kind="warn">
          Possible duplicate{similar.length > 1 ? 's' : ''}: {similar.map(({ item: s }) => (
            <span key={s.id} className="dupe-inline"><a href={`#/item/${s.id}`}>{s.title}</a> <button type="button" className="btn btn-sm" onClick={() => { const merged = merge(item, s); setStore({ items: store.items.filter((i) => i.id !== s.id).map((i) => (i.id === item.id ? merged : i)) }); setFlash({ kind: 'success', text: `Merged — now ${merged.mentions.length} mentions.` }); }}>Merge into this</button></span>
          ))}
        </Notice>
      )}
      <div className="layout-main">
        <div className="stack">
          <section className="card stack" aria-labelledby="men-t">
            <div className="card-title-row"><h2 id="men-t" className="h3">Mentions</h2><CatTag c={item.category} /></div>
            {item.detail && <p className="note-box">{item.detail}</p>}
            <ol className="mentions">{[...item.mentions].reverse().map((m, n) => <li key={n}><blockquote className="q">“{m.quote}”</blockquote><span className="small muted">{m.who} · {m.source} · {formatDay(m.date)}</span></li>)}</ol>
          </section>
          <section className="card stack" aria-labelledby="rep-t">
            <h2 id="rep-t" className="h3">What we’ve told people</h2>
            {item.replies.length === 0 ? <p className="small muted">No replies logged.</p> : <ul className="list">{item.replies.map((r, n) => <li key={n} className="row-between"><span>{r.text}</span><span className="small muted">{formatDay(r.date, { day: 'numeric', month: 'short' })}</span></li>)}</ul>}
            <form className="filters" onSubmit={(e) => { e.preventDefault(); if (!reply.trim()) return; update({ replies: [...item.replies, { date: today, text: reply.trim() }] }); setReply(''); }}>
              <Field label="Log a reply" className="grow">{(p) => <input {...p} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="e.g. Told them it’s planned for Q1" />}</Field>
              <button className="btn" type="submit">Add</button>
            </form>
          </section>
        </div>
        <aside className="card stack">
          <h2 className="h3">RICE score</h2>
          <form className="stack" onSubmit={saveScore} noValidate>
            <Field label="Reach" hint="People affected per quarter" error={scErr.reach}>{(p) => <input {...p} inputMode="numeric" value={sc.reach} onChange={(e) => setSc({ ...sc, reach: e.target.value })} />}</Field>
            <Field label="Impact">{(p) => <select {...p} value={sc.impact} onChange={(e) => setSc({ ...sc, impact: e.target.value })}>{IMPACT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
            <Field label="Confidence">{(p) => <select {...p} value={sc.confidence} onChange={(e) => setSc({ ...sc, confidence: e.target.value })}>{CONFIDENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
            <Field label="Effort" hint="Person-weeks" error={scErr.effort}>{(p) => <input {...p} inputMode="decimal" value={sc.effort} onChange={(e) => setSc({ ...sc, effort: e.target.value })} />}</Field>
            <p className="display-num" aria-live="polite">{preview ?? '—'}</p>
            <p className="small muted">Reach × impact × confidence ÷ effort{quadrant({ ...item, impact: Number(sc.impact), effort: Number(sc.effort) || null }) && ` · ${quadrant({ ...item, impact: Number(sc.impact), effort: Number(sc.effort) || null })}`}</p>
            <button className="btn btn-primary" type="submit">Save score</button>
          </form>
          <Field label="Category">{(p) => <select {...p} value={item.category} onChange={(e) => update({ category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Board ---------- */
function Board({ store, setStore }: Ctx) {
  const [cat, setCat] = useState('');
  const move = (i: Item, dir: -1 | 1) => { const k = STATUSES.indexOf(i.status) + dir; if (k >= 0 && k < STATUSES.length) setStore({ items: store.items.map((x) => (x.id === i.id ? { ...x, status: STATUSES[k] } : x)) }); };
  return (
    <div className="stack">
      <PageHead eyebrow="Board" title={<>From request <em>to release.</em></>} actions={<Field label="Category">{(p) => <select {...p} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>} />
      <div className="kanban">
        {STATUSES.map((s, si) => {
          const list = store.items.filter((i) => i.status === s && (!cat || i.category === cat)).sort((a, b) => (rice(b) ?? -1) - (rice(a) ?? -1));
          return (
            <section key={s} className="kcol" aria-labelledby={`k-${si}`}>
              <h2 id={`k-${si}`} className="kcol-head"><span>{s}</span><span className="badge">{list.length}</span></h2>
              <ul className="kcards">
                {list.map((i) => (
                  <li key={i.id} className="kcard" style={{ ['--c' as string]: CAT_COLOR[i.category] }}>
                    <a href={`#/item/${i.id}`}>{i.title}</a>
                    <span className="small muted">{i.mentions.length} mention{i.mentions.length === 1 ? '' : 's'}{rice(i) != null && <> · RICE <strong>{rice(i)}</strong></>}</span>
                    <div className="row-between">
                      <CatTag c={i.category} />
                      <span className="row nowrap">
                        {si > 0 && <button type="button" className="icon-btn" aria-label={`Move “${i.title}” back to ${STATUSES[si - 1]}`} onClick={() => move(i, -1)}>←</button>}
                        {si < STATUSES.length - 1 && <button type="button" className="icon-btn" aria-label={`Move “${i.title}” to ${STATUSES[si + 1]}`} onClick={() => move(i, 1)}>→</button>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Priorities ---------- */
function Priorities({ store }: Ctx) {
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [cat, setCat] = useState('');
  const rows = useMemo(() => store.items.filter((i) => (show === 'all' || isOpen(i)) && (!cat || i.category === cat)), [store, show, cat]);
  const columns: Column<Item>[] = [
    { key: 'title', label: 'Item', sort: (i) => i.title, render: (i) => <><a href={`#/item/${i.id}`}>{i.title}</a>{i.demo && <> <DemoTag /></>}</> },
    { key: 'cat', label: 'Category', sort: (i) => i.category, render: (i) => <CatTag c={i.category} /> },
    { key: 'st', label: 'Status', sort: (i) => STATUSES.indexOf(i.status), render: (i) => i.status },
    { key: 'men', label: 'Mentions', num: true, sort: (i) => i.mentions.length, render: (i) => i.mentions.length },
    { key: 'q', label: 'Quadrant', sort: (i) => quadrant(i) ?? '', render: (i) => quadrant(i) ?? <span className="muted">Not scored</span> },
    { key: 'rice', label: 'RICE', num: true, sort: (i) => rice(i), render: (i) => (rice(i) == null ? '—' : <strong>{rice(i)}</strong>) },
  ];
  const table = useTable(rows, columns, { initialSort: 'rice', initialDir: 'desc' });
  const unscored = rows.filter((i) => rice(i) == null && isOpen(i)).length;
  return (
    <div className="stack">
      <PageHead eyebrow="Priorities" title={<>What to build <em>next.</em></>} actions={<button type="button" className="btn" disabled={!rows.length} onClick={() => downloadText('signal-board.csv', toCSV(CSV_HEADERS, csvRows(rows)), 'text/csv')}>Export CSV</button>} />
      {unscored > 0 && <Notice kind="info">{unscored} open item{unscored === 1 ? ' isn’t' : 's aren’t'} scored yet — triage them from the inbox.</Notice>}
      <section className="card stack" aria-labelledby="mx-t"><h2 id="mx-t" className="h3">Impact vs effort</h2><Matrix items={store.items} /></section>
      <div className="card stack">
        <div className="filters">
          <Field label="Show">{(p) => <select {...p} value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}><option value="open">Open items</option><option value="all">All items</option></select>}</Field>
          <Field label="Category">{(p) => <select {...p} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        </div>
        <DataTable caption="Feedback ranked by RICE" columns={columns} table={table} rowKey={(i) => i.id} empty="Nothing matches these filters." />
      </div>
    </div>
  );
}
