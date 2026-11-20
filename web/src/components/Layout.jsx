import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useGuild } from '../GuildContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useLive } from '../LiveContext.jsx';
import { useDismissable } from '../hooks/useDismissable.js';
import { Icon, Logo, Avatar } from './ui.jsx';
import { RecDot } from './Live.jsx';

const SIDEBAR_KEY = 'parley-sidebar-collapsed';
const HEADER_BUTTON = 'h-9 w-9 shrink-0 place-items-center rounded-sm border border-border text-muted hover:text-ink hover:bg-surface-2 focus-visible:outline-primary transition-colors';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Icon.Home, end: true },
  { to: '/live', label: 'Live', icon: Icon.Radio, live: true },
  { to: '/meetings', label: 'Meetings', icon: Icon.Meetings },
  { to: '/action-items', label: 'Action items', icon: Icon.CheckSquare, end: true },
  { to: '/action-items/board', label: 'Board', icon: Icon.Columns },
  { to: '/analytics', label: 'Analytics', icon: Icon.Chart },
  { to: '/search', label: 'Search', icon: Icon.Search },
  { to: '/commands', label: 'Commands', icon: Icon.Terminal },
];

function GuildSwitcher() {
  const { guilds, guildId, setGuildId, error } = useGuild();
  if (error) return <span className="text-xs text-error">{error}</span>;
  return (
    <div className="relative min-w-0 max-w-[220px]">
      <select
        value={guildId || ''}
        onChange={(e) => setGuildId(e.target.value)}
        aria-label="Select server"
        className="max-w-full appearance-none bg-surface-2 hover:bg-surface-3 border border-border rounded-sm text-sm font-medium text-ink pl-3 pr-8 py-1.5 cursor-pointer transition-colors focus:outline-none focus:border-primary truncate"
      >
        {guilds.length === 0 && <option value="">No servers</option>}
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
    </div>
  );
}

// Pill in the top bar that appears whenever something is recording. Click → Live.
function LiveIndicator() {
  const { live } = useLive();
  if (!live.length) return null;
  return (
    <Link to="/live"
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-semibold no-underline transition-colors"
      style={{ color: 'var(--error)', background: 'var(--error-soft)' }}>
      <RecDot />
      {live.length === 1 ? 'Recording' : `${live.length} recording`}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-surface-2 transition-colors"
        aria-label="Account menu" aria-haspopup="menu" aria-expanded={open}
      >
        <Avatar name={user.username} size={28} />
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-ink sm:max-md:block lg:block">{user.username}</span>
        <Icon.Chevron width={13} height={13} className="rotate-90 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1.5 w-52 card shadow-lg p-1.5 z-20 animate-fade-in">
          <div className="px-2.5 py-2 border-b border-border mb-1">
            <p className="text-sm font-semibold text-ink truncate">{user.username}</p>
            <p className="text-xs text-muted truncate">{user.email || (user.isAdmin ? 'Administrator' : 'Member')}</p>
          </div>
          <Link to="/account" role="menuitem" className="nav-link !py-2" onClick={() => setOpen(false)}>
            <Icon.Settings width={16} height={16} />Account & users
          </Link>
          <button role="menuitem" onClick={logout} className="nav-link !py-2 w-full !text-error">
            <Icon.LogOut width={16} height={16} />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, label, icon: IconC, end, live, collapsed }) {
  const { live: sessions } = useLive();
  const count = live ? sessions.length : 0;
  return (
    <NavLink to={to} end={end} title={collapsed ? label : undefined}
      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
      <IconC width={18} height={18} className="shrink-0" aria-hidden="true" />
      <span className={collapsed ? 'md:sr-only' : undefined}>{label}</span>
      {count > 0 && (
        <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-error ${collapsed ? 'md:absolute md:right-0.5 md:top-1.5' : ''}`}>
          <RecDot size={7} /><span className={collapsed ? 'md:sr-only' : undefined}>{count}</span>
        </span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [navOpen, setNavOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true'; } catch { return false; }
  });
  const drawerRef = useDismissable(navOpen, () => setNavOpen(false));
  const sidebarLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* storage can be unavailable */ }
  }

  function onSearch(e) {
    e.preventDefault();
    const t = q.trim();
    if (t) navigate(`/search?q=${encodeURIComponent(t)}`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Mobile backdrop */}
      {navOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" aria-hidden="true" />}
      {/* ── Sidebar (static ≥md, slide-in drawer <md) ───────────────── */}
      <aside
        id="workspace-sidebar"
        ref={drawerRef}
        className={`z-40 flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-border bg-bg-2
          max-md:fixed max-md:inset-y-0 max-md:left-0 motion-safe:max-md:transition-[transform,visibility] motion-safe:md:transition-[width]
          ${navOpen ? 'max-md:translate-x-0' : 'max-md:invisible max-md:-translate-x-full'} ${collapsed ? 'md:w-16' : ''}`}
      >
        <Link to="/" onClick={() => setNavOpen(false)} aria-label="Parley home"
          className={`flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 px-5 no-underline ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <Logo size={30} className="shrink-0" />
          <span className={`font-display text-[19px] font-extrabold text-ink tracking-tight ${collapsed ? 'md:hidden' : ''}`}>Parley</span>
        </Link>

        <nav aria-label="Workspace" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" onClick={() => setNavOpen(false)}>
          <p aria-hidden="true" className={`px-2 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint ${collapsed ? 'md:hidden' : ''}`}>Workspace</p>
          {NAV.map((item) => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
        </nav>

        <div className="px-3 py-3 border-t border-border" onClick={() => setNavOpen(false)}>
          <NavItem to="/setup" label="Settings" icon={Icon.Settings} collapsed={collapsed} />
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 h-[var(--topbar-h)] border-b border-border bg-bg/80 backdrop-blur flex items-center gap-3 px-4 sm:px-6">
          {/* Hamburger — only below md, where the sidebar is a drawer. */}
          <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-controls="workspace-sidebar"
            aria-expanded={navOpen} className={`grid md:hidden ${HEADER_BUTTON}`}>
            <Icon.Menu width={18} height={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={toggleSidebar} aria-label={sidebarLabel} title={sidebarLabel} aria-controls="workspace-sidebar"
            aria-expanded={!collapsed} className={`hidden md:grid ${HEADER_BUTTON}`}>
            <Icon.Sidebar width={18} height={18} aria-hidden="true" />
          </button>
          <GuildSwitcher />

          <form onSubmit={onSearch} className="relative hidden min-w-[96px] flex-[0_1_240px] sm:block lg:ml-2">
            <Icon.Search width={15} height={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search transcripts…"
              className="w-full bg-surface-2 border border-border rounded-sm text-sm text-ink pl-8 pr-3 py-1.5 focus:outline-none focus:border-primary placeholder:text-muted"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LiveIndicator />
            <button
              onClick={toggle}
              className="h-9 w-9 grid place-items-center rounded-sm border border-border text-muted hover:text-ink hover:bg-surface-2 transition-colors"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Icon.Sun width={17} height={17} /> : <Icon.Moon width={17} height={17} />}
            </button>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
