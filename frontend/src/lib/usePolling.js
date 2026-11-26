import { useEffect } from 'react';

// Calls `callback` now, then again every `intervalMs` - but only while the
// browser tab is visible.
//  - A tab nobody is looking at makes no requests at all (a dashboard left
//    open overnight used to refresh every minute, all night).
//  - Coming back to a tab whose data has gone stale refreshes it immediately.
//  - If `callback` changes (e.g. you move to a different website's page) it
//    starts over and loads straight away.
export function usePolling(callback, intervalMs) {
  useEffect(() => {
    let timer = null;
    let lastRun = 0;

    const run = () => {
      lastRun = Date.now();
      callback();
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(run, intervalMs);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        if (Date.now() - lastRun >= intervalMs) run();
        start();
      }
    };

    run();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [callback, intervalMs]);
}