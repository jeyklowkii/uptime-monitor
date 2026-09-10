import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Skeleton, ErrorState, PageHeader, Select } from '../components/ui.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function fmtDuration(seconds) {
  if (seconds == null) return 'Ongoing';
  const mins = Math.round(seconds / 60);
  if (mins < 1) return `${seconds}s`;
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Incidents() {
  const [incidents, setIncidents] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      setIncidents(await api.listIncidents(filter ? { status: filter } : undefined));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !incidents) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="History of every DOWN event that was detected, across all monitored sites."
        action={
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="recovered">Recovered</option>
          </Select>
        }
      />

      <Card className="overflow-hidden">
        {!incidents ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No incidents" description="Nothing has gone down yet - that's a good sign." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Website</th>
                  <th className="px-3 py-3 font-medium">Incident</th>
                  <th className="px-3 py-3 font-medium">Started</th>
                  <th className="px-3 py-3 font-medium">Recovered</th>
                  <th className="px-3 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => (
                  <>
                    <tr
                      key={inc.id}
                      onClick={() => setExpanded(expanded === inc.id ? null : inc.id)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-raised/40"
                    >
                      <td className="px-5 py-3">
                        <Link
                          to={`/websites/${inc.website_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium hover:text-accent"
                        >
                          {inc.website_name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted">{inc.reason}</td>
                      <td className="px-3 py-3">{fmt(inc.started_at)}</td>
                      <td className="px-3 py-3">{inc.recovered_at ? fmt(inc.recovered_at) : '—'}</td>
                      <td className="px-3 py-3 font-mono tabular">{fmtDuration(inc.duration_seconds)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={inc.status === 'active' ? 'down' : 'up'} size="sm" />
                      </td>
                    </tr>
                    {expanded === inc.id && (
                      <tr className="border-b border-line bg-raised/30">
                        <td colSpan={6} className="px-5 py-3 text-sm text-muted">
                          <div className="grid gap-1 sm:grid-cols-2">
                            <div>URL: {inc.website_url}</div>
                            <div>Reason: {inc.reason}</div>
                            <div>DOWN email sent: {inc.notification_sent ? 'Yes' : 'No'}</div>
                            <div>Recovery email sent: {inc.recovery_notification_sent ? 'Yes' : 'No'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
