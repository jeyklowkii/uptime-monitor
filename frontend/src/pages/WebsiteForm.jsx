import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Button, Input, Label, Select, Toggle, PageHeader, ErrorState } from '../components/ui.jsx';
import { IconClose, IconChevronLeft } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';

const DEFAULTS = {
  name: '',
  url: '',
  enabled: true,
  check_interval_seconds: 60,
  timeout_seconds: 10,
  expected_status_code: 200,
  failure_threshold: 2,
  alert_on_slow: false,
  slow_threshold_ms: 3000,
  notify_on_down: true,
  notify_on_recovery: true,
  notify_on_slow: false,
  notify_every_failed_check: false,
  recipients: [],
};

function RecipientsInput({ value, onChange }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const email = draft.trim().replace(/,$/, '');
    if (email && /\S+@\S+\.\S+/.test(email) && !value.includes(email)) {
      onChange([...value, email]);
    }
    setDraft('');
  }

  return (
    <div className="rounded-md border border-line bg-bg px-2 py-1.5 focus-within:border-accent">
      <div className="flex flex-wrap gap-1.5">
        {value.map((email) => (
          <span
            key={email}
            className="flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-xs text-ink"
          >
            {email}
            <button type="button" onClick={() => onChange(value.filter((e) => e !== email))} className="text-muted hover:text-critical">
              <IconClose width={12} height={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={value.length ? 'Add another…' : 'admin@example.com'}
          className="min-w-[10rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}

export default function WebsiteForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api
      .getWebsite(id)
      .then((site) =>
        setForm({
          ...DEFAULTS,
          ...site,
          enabled: Boolean(site.enabled),
          alert_on_slow: Boolean(site.alert_on_slow),
          notify_on_down: Boolean(site.notify_on_down),
          notify_on_recovery: Boolean(site.notify_on_recovery),
          notify_on_slow: Boolean(site.notify_on_slow),
          notify_every_failed_check: Boolean(site.notify_every_failed_check),
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        check_interval_seconds: Number(form.check_interval_seconds),
        timeout_seconds: Number(form.timeout_seconds),
        expected_status_code: Number(form.expected_status_code),
        failure_threshold: Number(form.failure_threshold),
        slow_threshold_ms: Number(form.slow_threshold_ms),
      };
      if (isEdit) {
        await api.updateWebsite(id, payload);
        toast.success('Website updated');
      } else {
        await api.createWebsite(payload);
        toast.success('Website added');
      }
      navigate('/websites');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <Link to="/websites" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <IconChevronLeft width={16} height={16} /> Back to websites
      </Link>
      <PageHeader title={isEdit ? 'Edit website' : 'Add website'} />

      <form onSubmit={handleSubmit}>
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Website name</Label>
              <Input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Company Website" />
            </div>
            <div className="sm:col-span-2">
              <Label>URL</Label>
              <Input
                required
                type="url"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div>
              <Label hint="checks run at most once a minute">Check interval</Label>
              <Select value={form.check_interval_seconds} onChange={(e) => set('check_interval_seconds', e.target.value)}>
                <option value={60}>Every 1 minute</option>
                <option value={300}>Every 5 minutes</option>
                <option value={600}>Every 10 minutes</option>
                <option value={900}>Every 15 minutes</option>
              </Select>
            </div>
            <div>
              <Label>Timeout</Label>
              <Select value={form.timeout_seconds} onChange={(e) => set('timeout_seconds', e.target.value)}>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
              </Select>
            </div>

            <div>
              <Label>Expected HTTP status</Label>
              <Input
                type="number"
                min={100}
                max={599}
                value={form.expected_status_code}
                onChange={(e) => set('expected_status_code', e.target.value)}
              />
            </div>
            <div>
              <Label hint="consecutive failures">Failed checks before DOWN</Label>
              <Select value={form.failure_threshold} onChange={(e) => set('failure_threshold', e.target.value)}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label>Alert email recipients</Label>
              <RecipientsInput value={form.recipients} onChange={(v) => set('recipients', v)} />
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <Toggle
              checked={form.enabled}
              onChange={(v) => set('enabled', v)}
              label="Enable monitoring"
              description="Uncheck to pause checks without deleting the site."
            />
            <Toggle
              checked={form.alert_on_slow}
              onChange={(v) => set('alert_on_slow', v)}
              label="Alert on slow response"
              description="Mark the site as degraded when it responds slower than the threshold."
            />
            {form.alert_on_slow && (
              <div className="ml-0 mb-2 max-w-xs">
                <Label>Slow response threshold (ms)</Label>
                <Input
                  type="number"
                  min={100}
                  value={form.slow_threshold_ms}
                  onChange={(e) => set('slow_threshold_ms', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="border-t border-line pt-2">
            <div className="mb-1 mt-3 text-sm font-medium">Notifications for this site</div>
            <Toggle checked={form.notify_on_down} onChange={(v) => set('notify_on_down', v)} label="Email when website goes DOWN" />
            <Toggle checked={form.notify_on_recovery} onChange={(v) => set('notify_on_recovery', v)} label="Email when website RECOVERS" />
            <Toggle checked={form.notify_on_slow} onChange={(v) => set('notify_on_slow', v)} label="Email when website becomes SLOW" />
            <Toggle
              checked={form.notify_every_failed_check}
              onChange={(v) => set('notify_every_failed_check', v)}
              label="Email for every failed check"
              description="Off by default - sends a lot of email while a site stays down."
            />
          </div>
        </Card>

        {error && <div className="mt-4"><ErrorState message={error} /></div>}

        <div className="mt-5 flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save website'}
          </Button>
          <Link to="/websites">
            <Button type="button" variant="secondary">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
