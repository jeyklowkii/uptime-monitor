import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api/client.js';
import { Card, Button, Skeleton, ErrorState } from '../components/ui.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { IconChevronLeft, IconRefresh, IconExternal, IconEdit } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

const DOT_COLOR = { up: '#35D399', down: '#FB5A5A', degraded: '#F5B94D' };

export default function WebsiteDetails() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setData(await api.getWebsite(id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    // 60s, not 15s - this reads up to 50 check rows each time; no reason
    // to refresh faster than someone's actually watching the screen.
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function checkNow() {
    setChecking(true);
    try {
      await api.checkWebsiteNow(id);
      await load();
      toast.success('Check complete');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const chartData = [...data.recentChecks]
    .reverse()
    .filter((c) => c.response_time_ms != null)
    .map((c) => ({ time: fmtTime(c.checked_at), ms: c.response_time_ms }));

  const latest = data.recentChecks[0];

  return (
    <div>
      <Link to="/websites" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <IconChevronLeft width={16} height={16} /> Back to websites
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">{data.name}</h2>
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-muted hover:text-accent"
          >
            {data.url} <IconExternal />
          </a>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={checkNow} disabled={checking}>
            <IconRefresh className={checking ? 'animate-spin' : ''} width={14} height={14} /> Check now
          </Button>
          <Link to={`/websites/${id}/edit`}>
            <Button variant="secondary" size="sm">
              <IconEdit /> Edit
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-1">
          <div className="text-sm text-muted">Current status</div>
          <div className="mt-2">
            <StatusBadge status={data.current_status} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Response time</dt>
              <dd className="font-mono tabular">{latest?.response_time_ms != null ? `${latest.response_time_ms} ms` : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">HTTP status</dt>
              <dd className="font-mono tabular">{latest?.http_status_code ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Last checked</dt>
              <dd>{data.last_checked_at ? new Date(data.last_checked_at).toLocaleString() : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5 md:col-span-2">
          <div className="mb-3 text-sm text-muted">Uptime statistics</div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['24 hours', data.uptime.last24h],
              ['7 days', data.uptime.last7d],
              ['30 days', data.uptime.last30d],
              ['90 days', data.uptime.last90d],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-display text-2xl font-semibold tabular">{value}%</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-4 text-sm text-muted">Response time</div>
        {chartData.length < 2 ? (
          <div className="py-10 text-center text-sm text-muted">Not enough data yet - check back after a few checks.</div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-line)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--c-muted)' }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--c-muted)' }} width={50} unit="ms" />
                <Tooltip
                  contentStyle={{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="ms" stroke="#4C8DFF" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="border-b border-line px-5 py-3 text-sm text-muted">Status history</div>
        <div className="max-h-96 divide-y divide-line overflow-y-auto">
          {data.recentChecks.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">No checks recorded yet.</div>
          ) : (
            data.recentChecks.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: DOT_COLOR[c.status] || '#5B6B87' }} />
                  <span className="font-mono tabular text-muted">{fmtTime(c.checked_at)}</span>
                </div>
                <span className="font-mono tabular">
                  {c.status === 'down' ? c.error_message || `HTTP ${c.http_status_code}` : `${c.response_time_ms} ms`}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
