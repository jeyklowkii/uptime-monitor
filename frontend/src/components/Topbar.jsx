import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { IconMenu, IconSun, IconMoon } from './icons.jsx';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Topbar({ title, onMenu }) {
  const { theme, toggle } = useTheme();
  const now = useClock();

  return (
    <header className="flex items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <button className="text-muted md:hidden" onClick={onMenu} aria-label="Open menu">
          <IconMenu />
        </button>
        <h1 className="font-display text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-xs text-muted sm:block tabular">
          {now.toLocaleTimeString('en-US', { hour12: true })}
        </span>
        <button
          onClick={toggle}
          className="rounded-md border border-line p-1.5 text-muted hover:text-ink"
          aria-label="Toggle color theme"
          title="Toggle color theme"
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}
