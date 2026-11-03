import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { api } from '../api/client.js';
import { Card, Button, Skeleton, ErrorState, PageHeader, Select } from '../components/ui.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatDuration } from '../lib/downtime.js';

const STATUS_COLOR = { up: '#35D399', down: '#FB5A5A', degraded: '#F5B94D', unknown: '#5B6B87' };

// Keys match what fleet_downtime() returns (supabase/migrations/...0004).
const PERIODS = ['24h', '7d', '30d', '90d'];

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('30d');

  // The response-time chart is loaded on its own. It is the one query that
  // scans the large checks table, so if it is slow (or times out) only the
  // chart is affected - the downtime card and the table still show.
  const [responseTimes, setResponseTimes] = useState(null); // { [websiteId]: ms } once loaded
  const [responseTimesError, setResponseTimesError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.getAnalytics());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadResponseTimes = useCallback(async () => {
    setResponseTimes(null);
    setResponseTimesError('');
    try {
      setResponseTimes(await api.getResponseTimes());
    } catch (err) {
      setResponseTimesError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    loadResponseTimes();
  }, [load, loadResponseTimes]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;

  const chartData = (data?.perWebsite ?? [])
    .filter((w) => responseTimes && responseTimes[w.websiteId] != null)
    .map((w) => ({ name: w.name, ms: Number(responseTimes[w.websiteId]), status: w.status }));

  // All four periods arrive in one response, so switching the dropdown is
  // instant - no refetch. Recomputed from the sites that exist at load time.
  const fleet = data?.fleetDowntime?.[period];
  const downtimePercent = fleet ? Number(fleet.downtimePercent) : null;

  return (
    <div>
      <PageHeader title="Analytics" description="Uptime and response-time trends across every monitored site." />

      {!data ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : data.perWebsite.length === 0 ? (
        <EmptyState title="Nothing to analyze yet" description="Add a website to start collecting data." />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-muted">Total downtime across all sites</div>
                <div className="mt-1 font-display text-3xl font-semibold tabular">
                  {downtimePercent != null ? `${downtimePercent.toFixed(2)}%` : '—'}
                </div>
              </div>
              <div className="w-28 shrink-0">
                <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Time period">
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted">
              {fleet
                ? `${(100 - downtimePercent).toFixed(2)}% uptime · ${formatDuration(fleet.downtimeSeconds)} of downtime ` +
                  `added up across ${fleet.siteCount} site${fleet.siteCount === 1 ? '' : 's'}. ` +
                  'Recalculates automatically as sites are added or removed.'
                : 'Downtime summary unavailable.'}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-1 text-sm text-muted">Average response time, last 30 days</div>
            {responseTimesError ? (
              <div className="py-8 text-center text-sm">
                <div className="text-critical">Couldn&apos;t load response times: {responseTimesError}</div>
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={loadResponseTimes}>
                    Try again
                  </Button>
                </div>
                <div className="mt-2 text-xs text-muted">The rest of this page is not affected.</div>
              </div>
            ) : responseTimes === null ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted">Not enough data yet.</div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-line)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--c-muted)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--c-muted)' }} width={50} unit="ms" />
                    <Tooltip
                      contentStyle={{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="ms" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={STATUS_COLOR[d.status] || '#4C8DFF'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3 text-sm text-muted">
              <span>Uptime by site</span>
              <span>{data.incidentsLast30d} incident{data.incidentsLast30d === 1 ? '' : 's'} in the last 30 days</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-5 py-3 font-medium">Website</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">24h</th>
                    <th className="px-3 py-3 font-medium">7d</th>
                    <th className="px-3 py-3 font-medium">30d</th>
                    <th className="px-3 py-3 font-medium">90d</th>
                    <th className="px-5 py-3 font-medium">Downtime (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perWebsite.map((w) => (
                    <tr key={w.websiteId} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 font-medium">{w.name}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={w.status} size="sm" />
                      </td>
                      <td className="px-3 py-3 font-mono tabular">{w.uptime.last24h}%</td>
                      <td className="px-3 py-3 font-mono tabular">{w.uptime.last7d}%</td>
                      <td className="px-3 py-3 font-mono tabular">{w.uptime.last30d}%</td>
                      <td className="px-3 py-3 font-mono tabular">{w.uptime.last90d}%</td>
                      <td className="px-5 py-3 font-mono tabular">{formatDuration(w.downtimeSeconds30d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}