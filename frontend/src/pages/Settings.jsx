import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Card, Button, Input, Label, Toggle, PageHeader, ErrorState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const EMPTY = {
  notify_on_down: true,
  notify_on_recovery: true,
  notify_on_slow: false,
  notify_every_failed_check: false,
};

export default function Settings() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testTo, setTestTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setForm({ ...EMPTY, ...s }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateSettings({
        notify_on_down: form.notify_on_down,
        notify_on_recovery: form.notify_on_recovery,
        notify_on_slow: form.notify_on_slow,
        notify_every_failed_check: form.notify_every_failed_check,
      });
      toast.success('Settings saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    if (!testTo) return;
    setSendingTest(true);
    try {
      await api.sendTestEmail(testTo);
      toast.success(`Test email sent to ${testTo}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Configure how the system sends email alerts." />

      <Card className="p-5">
        <div className="mb-2 text-sm font-medium">Email delivery (Brevo)</div>
        <p className="text-sm text-muted">
          Your Brevo API key isn't stored in this app - it's set as a Supabase Edge Function secret, so it
          never passes through your browser or this database. To (re)configure it:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            In the{' '}
            <a
              href="https://app.brevo.com/settings/keys/api"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Brevo dashboard
            </a>
            , grab your API key (Settings → SMTP &amp; API → API Keys), and verify a sender address
            (Settings → Senders, Domains &amp; Dedicated IPs).
          </li>
          <li>
            From a terminal, in the project root:
            <pre className="mt-1.5 overflow-x-auto rounded bg-raised px-3 py-2 text-xs">
{`supabase secrets set BREVO_API_KEY=xkeysib-...
supabase secrets set BREVO_FROM_EMAIL=alerts@yourdomain.com
supabase secrets set BREVO_FROM_NAME="Website Monitor"`}
            </pre>
          </li>
          <li>Redeploy the Edge Functions so they pick up the new secrets: <code className="rounded bg-raised px-1 py-0.5 text-xs">npm run functions:deploy</code></li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          Full walkthrough in the README's "Set up Brevo" section.
        </p>
      </Card>

      <form onSubmit={handleSave}>
        <Card className="p-5">
          <div className="mb-1 text-sm font-medium">Default notifications</div>
          <p className="mb-1 text-xs text-muted">Applied to new websites - each site can override these individually.</p>
          <Toggle checked={form.notify_on_down} onChange={(v) => set('notify_on_down', v)} label="Email when website goes DOWN" />
          <Toggle checked={form.notify_on_recovery} onChange={(v) => set('notify_on_recovery', v)} label="Email when website RECOVERS" />
          <Toggle checked={form.notify_on_slow} onChange={(v) => set('notify_on_slow', v)} label="Email when website becomes SLOW" />
          <Toggle
            checked={form.notify_every_failed_check}
            onChange={(v) => set('notify_every_failed_check', v)}
            label="Email for every failed check"
          />
        </Card>

        {error && <div className="mt-4"><ErrorState message={error} /></div>}

        <div className="mt-5">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>

      <Card className="p-5">
        <div className="mb-1 text-sm font-medium">Send a test email</div>
        <p className="mb-3 text-xs text-muted">Confirms your Brevo API key and sender are working.</p>
        <div className="flex gap-2">
          <Input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="max-w-xs"
          />
          <Button type="button" variant="secondary" onClick={handleTestEmail} disabled={sendingTest || !testTo}>
            {sendingTest ? 'Sending…' : 'Send test email'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
