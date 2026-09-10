import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Button, Skeleton, ErrorState, PageHeader, Toggle } from '../components/ui.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { IconEdit, IconTrash, IconRefresh } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Websites() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setSites(await api.listWebsites());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(site) {
    setSites((list) => list.map((s) => (s.id === site.id ? { ...s, enabled: !s.enabled } : s)));
    try {
      await api.updateWebsite(site.id, { enabled: !site.enabled });
    } catch (err) {
      toast.error(err.message);
      load();
    }
  }

  async function checkNow(site) {
    setCheckingId(site.id);
    try {
      await api.checkWebsiteNow(site.id);
      toast.success(`Checked ${site.name}`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingId(null);
    }
  }

  async function confirmDelete() {
    try {
      await api.deleteWebsite(pendingDelete.id);
      toast.success(`Removed ${pendingDelete.name}`);
      setPendingDelete(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (error && !sites) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Websites"
        description="Add and configure the sites you want monitored."
        action={
          <Link to="/websites/new">
            <Button size="sm">Add website</Button>
          </Link>
        }
      />

      <Card className="overflow-hidden">
        {!sites ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No websites yet"
              description="Add your first website to start monitoring its uptime and response time."
              action={
                <Link to="/websites/new">
                  <Button size="sm">Add website</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Website</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Interval</th>
                  <th className="px-3 py-3 font-medium">Monitoring</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
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
                    <td className="px-3 py-3 font-mono tabular text-muted">
                      every {site.check_interval_seconds}s
                    </td>
                    <td className="px-3 py-3">
                      <Toggle checked={Boolean(site.enabled)} onChange={() => toggleEnabled(site)} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => checkNow(site)}
                          disabled={checkingId === site.id}
                          className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-accent disabled:opacity-40"
                          title="Check now"
                          aria-label={`Check ${site.name} now`}
                        >
                          <IconRefresh className={checkingId === site.id ? 'animate-spin' : ''} />
                        </button>
                        <Link
                          to={`/websites/${site.id}/edit`}
                          className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink"
                          title="Edit"
                          aria-label={`Edit ${site.name}`}
                        >
                          <IconEdit />
                        </Link>
                        <button
                          onClick={() => setPendingDelete(site)}
                          className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-critical"
                          title="Delete"
                          aria-label={`Delete ${site.name}`}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This removes the website and its full monitoring history. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
