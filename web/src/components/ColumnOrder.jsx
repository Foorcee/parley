import { useId, useRef, useState } from 'react';
import { Avatar, Icon } from './ui.jsx';

const MOVE_BUTTON = 'btn btn-ghost !p-2 focus-visible:outline-primary aria-disabled:cursor-default aria-disabled:opacity-40';

export default function ColumnOrder({ names, custom, onChange }) {
  const dialog = useRef(null);
  const id = useId();
  const [announcement, setAnnouncement] = useState('');

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= names.length) return;
    const next = [...names];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`${names[index]} moved to column ${target + 1} of ${names.length}.`);
  }

  function reset() {
    onChange([]);
    setAnnouncement('Alphabetical order restored.');
  }

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-controls={id} aria-label="Column order" title="Column order"
        className="btn btn-ghost h-8 w-8 !p-0 focus-visible:outline-primary" onClick={() => dialog.current.showModal()}>
        <Icon.Settings width={16} height={16} aria-hidden="true" />
      </button>
      <dialog id={id} ref={dialog} aria-labelledby={`${id}-title`} onClose={() => setAnnouncement('')}
        className="card m-auto w-[calc(100%-2rem)] max-w-sm p-0 text-ink shadow-lg backdrop:bg-black/50">
        <div className="flex max-h-[min(32rem,calc(100vh-2rem))] flex-col">
          <header className="shrink-0 border-b px-4 py-3">
            <h2 id={`${id}-title`} className="text-base font-bold">Column order</h2>
            <p className="mt-0.5 text-xs text-muted">The first person in this list appears on the left.</p>
          </header>
          <ol role="list" className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
            {names.map((name, index) => (
              <li key={name} className="flex items-center gap-2.5 py-2">
                <Avatar name={name} size={24} />
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{name}</span>
                <div className="flex shrink-0 gap-1">
                  <button type="button" aria-label={`Move ${name} up`} aria-disabled={index === 0}
                    className={MOVE_BUTTON} onClick={() => move(index, -1)}>
                    <Icon.Chevron width={14} height={14} className="-rotate-90" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Move ${name} down`} aria-disabled={index === names.length - 1}
                    className={MOVE_BUTTON} onClick={() => move(index, 1)}>
                    <Icon.Chevron width={14} height={14} className="rotate-90" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div role="status" className="sr-only">{announcement}</div>
          <form method="dialog" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <button type="button" disabled={!custom} onClick={reset} className="btn btn-ghost focus-visible:outline-primary">Reset to alphabetical</button>
            <button type="submit" className="btn btn-primary focus-visible:outline-primary">Done</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
