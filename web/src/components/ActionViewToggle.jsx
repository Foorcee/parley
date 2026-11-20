import { NavLink } from 'react-router-dom';

const segment = ({ isActive }) => `rounded-sm px-3 py-1.5 transition-colors focus-visible:outline-primary ${
  isActive ? 'bg-primary-soft text-ink' : 'text-muted hover:text-ink'
}`;

export default function ActionViewToggle() {
  return (
    <nav aria-label="Action item views" className="inline-flex rounded-sm border border-border bg-surface-2 p-0.5 text-xs font-semibold">
      <NavLink to="/action-items" end className={segment}>List</NavLink>
      <NavLink to="/action-items/board" end className={segment}>Board</NavLink>
    </nav>
  );
}
