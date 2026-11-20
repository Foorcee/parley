import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { useLive } from '../LiveContext.jsx';
import ActionViewToggle from '../components/ActionViewToggle.jsx';
import { Page } from '../components/Page.jsx';
import { Avatar, Empty, Icon } from '../components/ui.jsx';
import { buildCanonical, peopleOf, splitAssignees } from '../lib/assignees.js';
import { fmtDateShort, fmtRelative, toDate } from '../lib/format.js';

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const RESOLVED_PREVIEW = 5;
const COLUMN = 'w-[85vw] shrink-0 snap-start sm:w-[300px]';
const TRACK = 'flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-2';

const createdTime = (todo) => toDate(todo.created_at)?.getTime() ?? 0;
const resolvedTime = (todo) => toDate(todo.done_at ?? todo.created_at)?.getTime() ?? 0;

function buildColumns(todos) {
  const canonical = buildCanonical(todos.flatMap((todo) => splitAssignees(todo.assignee)));
  const names = [...new Set(canonical.values())].sort((a, b) => a.localeCompare(b));
  const columns = new Map(names.map((name) => [name, []]));
  const unassigned = [];
  for (const todo of todos) {
    const people = peopleOf(todo, canonical);
    if (people.length === 0) unassigned.push(todo);
    for (const name of people) columns.get(name).push(todo);
  }
  if (unassigned.length > 0) columns.set(null, unassigned);
  return columns;
}

function filterColumns(columns, attendees) {
  const names = attendees.map((a) => a.displayName?.trim()).filter(Boolean);
  const assigned = [...columns].filter(([name]) => name !== null);
  const canonical = buildCanonical([...assigned.map(([name]) => name), ...names]);
  const present = new Set(names.map((name) => canonical.get(name)));
  return new Map(assigned.filter(([name]) => present.has(canonical.get(name))));
}

function weekStarts(now) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 8 }, (_, i) => (
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i).getTime()
  ));
}

function ResolutionBars({ weeks }) {
  const max = Math.max(1, ...weeks);
  return (
    <svg width="68" height="25" viewBox="0 0 68 25" className="shrink-0 text-accent"
      role="img" aria-label={`Weekly resolutions, oldest to newest: ${weeks.join(', ')}`}>
      {weeks.map((count, i) => {
        const height = Math.max(2, Math.round(count / max * 25));
        return <rect key={i} x={i * 9} y={25 - height} width="5" height={height} rx="1.5" fill="currentColor" opacity={count ? 1 : 0.2} />;
      })}
    </svg>
  );
}

function BoardCard({ todo, now, busy, onToggle }) {
  const done = Boolean(todo.done);
  const age = now - resolvedTime(todo);
  const recent = done && age >= 0 && age < RECENT_MS;

  return (
    <li className={`card flex items-start gap-2.5 px-3 py-2.5 motion-safe:transition-colors ${done ? 'animate-fade-up' : ''} ${recent ? 'bg-accent-soft' : ''}`}>
      <input type="checkbox" checked={done} aria-disabled={busy} aria-label={todo.task}
        onChange={() => onToggle(todo)} className="pcheck mt-0.5 rounded-full motion-reduce:transition-none aria-disabled:cursor-default" />
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm leading-relaxed ${done ? 'text-ink-2' : 'text-ink'}`}>{todo.task}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <Link to={`/meetings/${todo.meeting_id}`} className="inline-flex items-center gap-1 no-underline hover:text-primary">
            <Icon.Doc width={12} height={12} aria-hidden="true" />
            {fmtDateShort(todo.created_at)}
          </Link>
          {done && todo.done_at && <span>· resolved {fmtRelative(todo.done_at)}</span>}
        </div>
      </div>
    </li>
  );
}

function BoardColumn({ name, todos, now, starts, pending, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const open = todos.filter((todo) => !todo.done).sort((a, b) => createdTime(a) - createdTime(b) || a.id - b.id);
  const resolved = todos.filter((todo) => todo.done).sort((a, b) => resolvedTime(b) - resolvedTime(a) || b.id - a.id);
  const weeks = starts.map(() => 0);
  for (const todo of resolved) {
    const time = resolvedTime(todo);
    const week = starts.findIndex((start) => start <= time);
    if (week !== -1 && time <= now) weeks[week]++;
  }

  const label = name ?? 'Unassigned';
  const olderCount = Math.max(resolved.length - RESOLVED_PREVIEW, 0);
  const card = (todo) => <BoardCard key={todo.id} todo={todo} now={now} busy={pending.has(todo.id)} onToggle={onToggle} />;

  return (
    <section aria-label={label} className={`${COLUMN} flex min-h-0 flex-col overflow-hidden rounded border border-border bg-bg-2`}>
      <header className="shrink-0 border-b px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={label} size={28} />
          <h2 className="min-w-0 truncate text-base font-bold text-ink" title={label}>{label}</h2>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-2"><span className="stat-value text-accent">{resolved.length}</span> resolved</p>
            <p className="mt-1 text-xs text-muted">{weeks[0]} this week <span className="text-faint">· {open.length} open</span></p>
          </div>
          <ResolutionBars weeks={[...weeks].reverse()} />
        </div>
      </header>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain p-3">
        {[
          ...open.map(card),
          open.length === 0 && <li key="clear" className="px-1 py-2 text-sm text-muted">All clear</li>,
          <li key="divider" className="flex items-center gap-2 px-1 pb-1 pt-2 text-xs font-semibold text-muted">
            Resolved · {resolved.length}<span aria-hidden="true" className="flex-1 border-t" />
          </li>,
          ...(expanded ? resolved : resolved.slice(0, RESOLVED_PREVIEW)).map(card),
          resolved.length === 0 && <li key="no-resolutions" className="px-1 py-1 text-sm text-muted">Nothing resolved yet</li>,
          olderCount > 0 && (
            <li key="older">
              <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
                className="w-full rounded-sm px-2 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-primary">
                {expanded ? 'Show fewer' : `Show ${olderCount} older`}
              </button>
            </li>
          ),
        ]}
      </ul>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className={TRACK} role="status" aria-label="Loading action board">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={`${COLUMN} card space-y-3 p-3`} aria-hidden="true">
          <div className="skeleton mb-4 h-24" />
          <div className="skeleton h-16" />
          <div className="skeleton h-20" />
          <div className="skeleton h-16" />
        </div>
      ))}
    </div>
  );
}

function GuildBoard({ guildId }) {
  const { live, latestMeetingAttendees, ready: liveReady, error: liveError } = useLive();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(Boolean(guildId));
  const [error, setError] = useState(null);
  const [toggleError, setToggleError] = useState(null);
  const [pending, setPending] = useState(new Set());
  const [participantsOnly, setParticipantsOnly] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    let stale = false;
    api.todos(guildId, {})
      .then((rows) => { if (!stale) setTodos(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (!stale) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [guildId]);

  async function toggle(todo) {
    if (pending.has(todo.id)) return;
    const done = !todo.done;
    const update = (values) => setTodos((rows) => rows.map((row) => row.id === todo.id ? { ...row, ...values } : row));

    setPending((ids) => new Set(ids).add(todo.id));
    setToggleError(null);
    update({ done, done_at: done ? new Date().toISOString() : null });
    try {
      const saved = await api.setTodoDone(todo.id, done);
      if (saved.done !== undefined) update({ done: saved.done, done_at: saved.done_at });
    } catch (e) {
      update({ done: todo.done, done_at: todo.done_at });
      setToggleError(e?.status === 403 ? 'Only admins can edit action items.' : (e?.message || 'Could not update'));
    } finally {
      setPending((ids) => {
        const next = new Set(ids);
        next.delete(todo.id);
        return next;
      });
    }
  }

  const allColumns = useMemo(() => buildColumns(todos), [todos]);
  const recordings = live.filter((s) => s.phase === 'recording');
  const isRecording = recordings.length > 0;
  const attendees = isRecording ? recordings.flatMap((s) => s.attendees ?? []) : latestMeetingAttendees;
  const columns = participantsOnly ? filterColumns(allColumns, attendees ?? []) : allColumns;
  const waitingForParticipants = participantsOnly && !liveReady;
  const participantError = participantsOnly && liveError;
  const now = Date.now();
  const starts = weekStarts(now);
  // Count each todo once in the page headline, even when it appears in several columns.
  const visibleTodos = participantsOnly ? [...new Set([...columns.values()].flat())] : todos;
  const completed = visibleTodos.filter((todo) => todo.done);
  const thisWeek = completed.filter((todo) => {
    const time = resolvedTime(todo);
    return time >= starts[0] && time <= now;
  }).length;
  const people = columns.size - Number(columns.has(null));
  const across = people ? ` across ${people} ${people === 1 ? 'person' : 'people'}` : '';
  const subtitle = guildId && !loading && !error && !waitingForParticipants && !participantError
    ? `${completed.length} resolved · ${thisWeek} this week${across}` : null;

  return (
    <Page max="none" className="flex h-full min-h-[400px] flex-col !pt-3 !pb-2">
      <header className={`mb-3 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 ${guildId ? 'lg:grid-cols-[minmax(0,1fr)_auto_auto]' : ''}`}>
        <div>
          <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-ink">Action board</h1>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="col-start-2 row-start-1 justify-self-end"><ActionViewToggle /></div>
        {guildId && (
          <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 lg:col-span-1 lg:col-start-3 lg:row-start-1">
            <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-ink-2">
              <span className="relative shrink-0">
                <input type="checkbox" role="switch" checked={participantsOnly}
                  onChange={(e) => setParticipantsOnly(e.target.checked)} className="peer sr-only" />
                <span className="block h-5 w-9 rounded-full border bg-surface-3 motion-safe:transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow motion-safe:transition-transform peer-checked:translate-x-4" />
              </span>
              Meeting participants only
            </label>
            {participantsOnly && liveReady && !liveError && attendees !== null && (
              <span className="text-xs text-muted">{isRecording ? 'Live recording' : 'Latest meeting'}</span>
            )}
          </div>
        )}
      </header>
      {toggleError && <p role="alert" className="mb-4 rounded-sm bg-error-soft px-3 py-2 text-xs text-error">{toggleError}</p>}
      {!guildId ? <Empty icon={Icon.Columns} title="No server selected" />
        : loading || waitingForParticipants ? <BoardSkeleton />
        : error ? <Empty icon={Icon.Columns} title="Couldn't load action items" body={error} />
        : participantError ? <Empty icon={Icon.Users} title="Couldn't load meeting participants" body={participantError} />
        : participantsOnly && columns.size === 0 ? (
          <div className="card">
            <Empty icon={Icon.Users} title={attendees === null ? 'No meetings yet' : 'No action items for meeting participants'} />
          </div>
        )
        : columns.size === 0 ? (
          <div className="card"><Empty icon={Icon.Columns} title="No action items" body="Action items appear here once meetings are summarized." /></div>
        ) : (
          <div className={TRACK}>
            {[...columns].map(([name, items]) => (
              <BoardColumn key={name === null ? 'unassigned' : `person:${name}`} name={name} todos={items}
                now={now} starts={starts} pending={pending} onToggle={toggle} />
            ))}
          </div>
        )}
    </Page>
  );
}

export default function ActionBoard() {
  const { guildId } = useGuild();
  return <GuildBoard key={guildId} guildId={guildId} />;
}
