import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { api } from '../api/client.js';
import { Card, Skeleton, ErrorState, PageHeader } from '../components/ui.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';

const STATUS_COLOR = { up: '#35D399', down: '#FB5A5A', degraded: '#F5B94D', unknown: '#5B6B87' };

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.getAnalytics());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;

  const chartData = data?.perWebsite
    .filter((w) => w.avgResponseTimeMs30d != null)
    .map((w) => ({ name: w.name, ms: w.avgResponseTimeMs30d, status: w.status }));

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
            <div className="mb-1 text-sm text-muted">Average response time, last 30 days</div>
            {chartData.length === 0 ? (
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
                    <th className="px-5 py-3 font-medium">90d</th>
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
                      <td className="px-5 py-3 font-mono tabular">{w.uptime.last90d}%</td>
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
