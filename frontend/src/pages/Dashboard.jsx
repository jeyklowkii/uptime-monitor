import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Button, Skeleton, ErrorState } from '../components/ui.jsx';
import StatTile from '../components/StatTile.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import PulseStrip from '../components/PulseStrip.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { usePolling } from '../lib/usePolling.js';

// Refresh every 5 minutes, and only while this tab is visible (see
// lib/usePolling.js). Each refresh downloads about 38 KB for 73 sites, so
// refreshing every minute in a tab left open all day used roughly 1.6 GB a
// month of the free plan's 5 GB of egress - per open tab.
const REFRESH_MS = 5 * 60 * 1000;

function timeAgo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [sites, setSites] = useState(null);
  const [pausedCount, setPausedCount] = useState(0);
  const [pulse, setPulse] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // One round trip, not three - getSummary/listWebsites/getPulse each
      // independently call listWebsites() (dashboard_websites() under the
      // hood) internally, so calling all three here would triple the
      // network round trips for the exact same data. Fetch once and derive
      // the summary counts + pulse ticks locally instead.
      const all = await api.listWebsites();

      // Sites with the Monitoring toggle switched off (Websites page) are not
      // being checked, so they are left out of the dashboard and its totals.
      // They stay on the Websites page, where they can be switched back on.
      const sites = all.filter((s) => s.enabled !== false);
      setPausedCount(all.length - sites.length);
      setSites(sites);

      const totals = { total: sites.length, online: 0, down: 0, degraded: 0, unknown: 0 };
      for (const s of sites) {
        if (s.current_status === 'up') totals.online += 1;
        else if (s.current_status === 'down') totals.down += 1;
        else if (s.current_status === 'degraded') totals.degraded += 1;
        else totals.unknown += 1;
      }
      const withAvg = sites.filter((s) => s.avg_response_time_24h != null);
      const avgResponseTimeMs = withAvg.length
        ? Math.round(withAvg.reduce((sum, s) => sum + Number(s.avg_response_time_24h), 0) / withAvg.length)
        : null;
      const overallUptime24h = sites.length
        ? Math.round((sites.reduce((sum, s) => sum + Number(s.uptime_24h), 0) / sites.length) * 100) / 100
        : 100;
      setSummary({ ...totals, avgResponseTimeMs, overallUptime24h });

      const map = {};
      sites.forEach((s) => (map[s.id] = s.recent_statuses || []));
      setPulse(map);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  usePolling(load, REFRESH_MS);

  if (error && !sites) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto">
        <div className="flex min-w-max divide-x divide-line px-5">
          {summary ? (
            <>
              <StatTile label="Monitored sites" value={summary.total} />
              <StatTile label="Online" value={summary.online} tone="signal" />
              <StatTile label="Down" value={summary.down} tone="critical" />
              <StatTile label="Degraded" value={summary.degraded} tone="warn" />
              <StatTile
                label="Avg response time"
                value={summary.avgResponseTimeMs != null ? `${summary.avgResponseTimeMs} ms` : '—'}
              />
              <StatTile label="Uptime (24h)" value={`${summary.overallUptime24h}%`} />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-1 min-w-[130px] px-5 py-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-8 w-14" />
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-semibold">Websites</h2>
          {pausedCount > 0 && (
            <div className="mt-0.5 text-xs text-muted">
              {pausedCount} paused site{pausedCount === 1 ? '' : 's'} not shown -{' '}
              <Link to="/websites" className="underline underline-offset-2 hover:text-accent">
                manage in Websites
              </Link>
            </div>
          )}
        </div>
        <Link to="/websites/new">
          <Button size="sm">Add website</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        {!sites ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="p-5">
            {pausedCount > 0 ? (
              <EmptyState
                title="All monitoring is paused"
                description={`${pausedCount} website${pausedCount === 1 ? ' is' : 's are'} paused. Switch monitoring back on from the Websites page.`}
                action={
                  <Link to="/websites">
                    <Button size="sm">Go to Websites</Button>
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title="No websites yet"
                description="Add your first website to start monitoring its uptime and response time."
                action={
                  <Link to="/websites/new">
                    <Button size="sm">Add website</Button>
                  </Link>
                }
              />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Website</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Recent checks</th>
                  <th className="px-3 py-3 font-medium">Response time</th>
                  <th className="px-3 py-3 font-medium">Last check</th>
                  <th className="px-3 py-3 font-medium">Uptime (24h)</th>
                  <th className="px-5 py-3 font-medium">Last incident</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id} className="border-b border-line last:border-0 hover:bg-raised/40">
                    <td className="px-5 py-3">
                      <Link to={`/websites/${site.id}`} className="font-medium hover:text-accent">
                        {site.name}
                      </Link>
                      <div className="text-xs text-muted">{site.url}</div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={site.current_status} size="sm" />
                    </td>
                    <td className="px-3 py-3">
                      <PulseStrip ticks={pulse[site.id] || []} height={20} barWidth={3} gap={1.5} />
                    </td>
                    <td className="px-3 py-3 font-mono tabular text-ink">
                      {site.last_response_time_ms != null ? `${site.last_response_time_ms} ms` : '—'}
                    </td>
                    <td className="px-3 py-3 text-muted">{timeAgo(site.last_checked_at)}</td>
                    <td className="px-3 py-3 font-mono tabular">{site.uptime_24h}%</td>
                    <td className="px-5 py-3 text-muted">{timeAgo(site.last_incident_at) === '—' ? 'None' : timeAgo(site.last_incident_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}