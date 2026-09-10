import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IconLogout, IconClose } from './icons.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/websites', label: 'Websites' },
  { to: '/incidents', label: 'Incidents' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout } = useAuth();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_10px_2px_rgba(53,211,153,0.6)]" />
          <span className="font-display text-[15px] font-semibold tracking-tight">Website Monitor</span>
        </div>
        <button className="md:hidden text-muted" onClick={onClose} aria-label="Close menu">
          <IconClose />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-raised text-ink font-medium' : 'text-muted hover:text-ink hover:bg-raised/60'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line px-3 py-4">
        <div className="flex items-center justify-between rounded-md px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user?.name || 'Administrator'}</div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            className="shrink-0 rounded-md p-1.5 text-muted hover:bg-raised hover:text-critical"
            title="Log out"
            aria-label="Log out"
          >
            <IconLogout />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-line md:bg-surface">
        {content}
      </aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface">{content}</aside>
        </div>
      )}
    </>
  );
}
