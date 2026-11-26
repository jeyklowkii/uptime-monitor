import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const KEY = 'uptime_monitor_theme';

// Browser storage can be unavailable or blocked (VS Code's embedded preview,
// some privacy modes, locked-down browsers) - touching it then throws. That
// must never take the whole app down with a blank page, so every access is
// guarded: the worst case is simply that your theme choice isn't remembered.
function readSavedTheme() {
  try {
    return localStorage.getItem(KEY) || 'dark';
  } catch {
    return 'dark';
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable - ignore
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readSavedTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}