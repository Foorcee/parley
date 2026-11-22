import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import ActionViewToggle from '../components/ActionViewToggle.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { Avatar, Icon, Empty } from '../components/ui.jsx';
import { splitAssignees, buildCanonical, peopleOf } from '../lib/assignees.js';
import { fmtDateShort } from '../lib/format.js';

const ALL = Symbol('all');

function TodoRow({ todo, onToggle, onEdit, onDelete, people }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.task);
  const done = Boolean(todo.done);
  async function run(fn) { if (busy) return false; setBusy(true); try { return await fn(); } finally { setBusy(false); } }
  const change = () => run(() => onToggle(todo));
  function startEdit() { setDraft(todo.task); setEditing(true); }
  async function save() {
    const text = draft.trim();
    if (!text || text === todo.task) { setEditing(false); return; }
    if (await run(() => onEdit(todo, text))) setEditing(false);
  }
  function remove() {
    if (!window.confirm(`Delete this action item?\n\n“${todo.task}”\n\nIt is also removed from the meeting notes.`)) return;
    run(() => onDelete(todo));
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
  }
  const iconBtn = 'h-7 w-7 grid place-items-center rounded-sm text-muted transition-colors disabled:opacity-40';
  return (
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors group">
      <input type="checkbox" checked={done} onChange={change} disabled={busy || editing} className="pcheck mt-0.5" aria-label={todo.task} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} autoFocus disabled={busy}
              rows={Math.min(6, Math.max(2, Math.ceil(draft.length / 80)))} aria-label="Action item text"
              className="input text-[14px] leading-relaxed resize-y" />
            <div className="flex items-center gap-2 mt-2">
              <button onClick={save} disabled={busy || !draft.trim()} className="btn btn-primary !py-1.5">Save</button>
              <button onClick={() => setEditing(false)} disabled={busy} className="btn btn-ghost !py-1.5">Cancel</button>
              <span className="text-xs text-faint hidden sm:inline">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <span className={`text-[14px] leading-relaxed block ${done ? 'line-through text-muted' : 'text-ink'}`}>{todo.task}</span>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {people.length > 0 ? people.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 chip"><Avatar name={p} size={15} />{p}</span>
          )) : <span className="chip text-muted">Unassigned</span>}
          <span className="text-faint text-xs">·</span>
          <Link to={`/meetings/${todo.meeting_id}`} className="text-xs text-muted hover:text-primary no-underline inline-flex items-center gap-1">
            <Icon.Doc width={12} height={12} /> {fmtDateShort(todo.created_at)}
          </Link>
        </div>
      </div>
      {!editing && (
        <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <button onClick={startEdit} disabled={busy} title="Edit text" aria-label={`Edit action item: ${todo.task}`}
            className={`${iconBtn} hover:text-ink hover:bg-surface-3`}>
            <Icon.Pencil width={15} height={15} />
          </button>
          <button onClick={remove} disabled={busy} title="Delete" aria-label={`Delete action item: ${todo.task}`}
            className={`${iconBtn} hover:text-error hover:bg-error-soft`}>
            <Icon.Trash width={15} height={15} />
          </button>
        </div>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <div className="card p-1">
      {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-14 skeleton m-2 rounded-md" />)}
    </div>
  );
}

export default function ActionItems() {
  const { guildId } = useGuild();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [person, setPerson] = useState(ALL); // ALL | null(unassigned) | name
  const [showDone, setShowDone] = useState(false);
  const [version, setVersion] = useState(0);
  const [toggleErr, setToggleErr] = useState(null);

  useEffect(() => { setPerson(ALL); setShowDone(false); }, [guildId]);

  useEffect(() => {
    if (!guildId) { setTodos([]); return; }
    let stale = false;
    setLoading(true); setError(null);
    api.todos(guildId, showDone ? {} : { open: true })
      .then((rows) => { if (!stale) { setTodos(Array.isArray(rows) ? rows : []); setLoading(false); } })
      .catch((e) => { if (!stale) { setError(e?.message || 'Failed to load'); setLoading(false); } });
    return () => { stale = true; };
  }, [guildId, showDone, version]);

  const failMsg = (e, fallback) => (e?.status === 403 ? 'Only admins can edit action items.' : (e?.message || fallback));

  async function toggle(t) {
    try { await api.setTodoDone(t.id, !t.done); setVersion((v) => v + 1); setToggleErr(null); }
    catch (e) { setToggleErr(failMsg(e, 'Could not update')); }
  }

  // Returns true on success so the row can leave edit mode.
  async function editTask(t, task) {
    try {
      await api.setTodoTask(t.id, task);
      setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, task } : x)));
      setToggleErr(null);
      return true;
    } catch (e) { setToggleErr(failMsg(e, 'Could not save')); return false; }
  }

  async function removeTodo(t) {
    try {
      await api.deleteTodo(t.id);
      setTodos((prev) => prev.filter((x) => x.id !== t.id));
      setToggleErr(null);
    } catch (e) { setToggleErr(failMsg(e, 'Could not delete')); }
  }

  const { canon, people, hasUnassigned } = useMemo(() => {
    const raw = []; let unassigned = false;
    for (const t of todos) { const ns = splitAssignees(t.assignee); if (ns.length === 0) unassigned = true; raw.push(...ns); }
    const map = buildCanonical(raw);
    const list = [...new Set(raw.map((n) => map.get(n) || n))].sort((a, b) => a.localeCompare(b));
    return { canon: map, people: list, hasUnassigned: unassigned };
  }, [todos]);

  // Counts per person for the filter chips.
  const counts = useMemo(() => {
    const c = new Map();
    for (const t of todos) for (const p of peopleOf(t, canon)) c.set(p, (c.get(p) || 0) + 1);
    return c;
  }, [todos, canon]);

  const visible = useMemo(() => todos.filter((t) => {
    if (person === ALL) return true;
    if (person === null) return splitAssignees(t.assignee).length === 0;
    return peopleOf(t, canon).includes(person);
  }), [todos, person, canon]);

  if (!guildId) return (
    <Page max="900px">
      <PageHead title="Action items" actions={<ActionViewToggle />} />
      <Empty icon={Icon.CheckSquare} title="No server selected" />
    </Page>
  );

  const openCount = todos.filter((t) => !t.done).length;

  return (
    <Page max="900px">
      <PageHead
        title="Action items"
        subtitle={`${openCount} open across ${people.length} ${people.length === 1 ? 'person' : 'people'}`}
        actions={
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="pcheck h-4 w-4" />
              Show completed
            </label>
            <ActionViewToggle />
          </div>
        }
      />

      {/* Person filter chips */}
      {toggleErr && (
        <p role="alert" className="text-xs text-error bg-error-soft rounded-sm px-3 py-2 mb-4">{toggleErr}</p>
      )}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button onClick={() => setPerson(ALL)} className={`chip ${person === ALL ? '!bg-primary-soft !text-ink' : ''}`}>
          Everyone <span className="text-faint">{todos.length}</span>
        </button>
        {people.map((p) => (
          <button key={p} onClick={() => setPerson(p)} className={`chip ${person === p ? '!bg-primary-soft !text-ink' : ''}`}>
            <Avatar name={p} size={15} />{p} <span className="text-faint">{counts.get(p) || 0}</span>
          </button>
        ))}
        {hasUnassigned && (
          <button onClick={() => setPerson(null)} className={`chip ${person === null ? '!bg-primary-soft !text-ink' : ''}`}>Unassigned</button>
        )}
      </div>

      {loading ? <Skeleton />
        : error ? <Empty icon={Icon.CheckSquare} title="Couldn't load action items" body={error} />
        : visible.length === 0 ? (
          <div className="card"><Empty icon={Icon.Check} title={showDone ? 'No action items' : 'All caught up'} body={showDone ? 'Action items appear here once meetings are summarized.' : 'No open tasks in this view.'} /></div>
        ) : (
          <ul className="card p-1 divide-y divide-border">
            {visible.map((t) => <TodoRow key={t.id} todo={t} onToggle={toggle} onEdit={editTask} onDelete={removeTodo} people={peopleOf(t, canon)} />)}
          </ul>
        )}
    </Page>
  );
}
