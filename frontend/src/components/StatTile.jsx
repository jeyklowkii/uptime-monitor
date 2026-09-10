export default function StatTile({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'signal'
      ? 'text-signal'
      : tone === 'critical'
      ? 'text-critical'
      : tone === 'warn'
      ? 'text-warn'
      : 'text-ink';

  return (
    <div className="flex-1 min-w-[130px] px-5 py-4 first:pl-0 last:pr-0">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold tabular ${toneClass}`}>{value}</div>
    </div>
  );
}
