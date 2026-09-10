import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Label } from '../components/ui.jsx';
import PulseStrip from '../components/PulseStrip.jsx';

const DECOR_TICKS = Array.from({ length: 40 }, (_, i) =>
  i === 39 ? 'up' : Math.random() > 0.94 ? 'down' : Math.random() > 0.88 ? 'degraded' : 'up'
);

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not log in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 text-idle opacity-70">
            <PulseStrip ticks={DECOR_TICKS} height={22} barWidth={3} gap={2} />
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_10px_2px_rgba(53,211,153,0.6)]" />
            <span className="font-display text-xl font-semibold tracking-tight">HLX Monitoring</span>
          </div>
          <p className="mt-1 text-sm text-muted">Sign in to your monitoring dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-6">
          <div className="mb-4">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div className="mb-5">
            <Label>Password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          ICT Dev-Ops <code className="font-mono"></code> Globalofficium Inc..
        </p>
      </div>
    </div>
  );
}
