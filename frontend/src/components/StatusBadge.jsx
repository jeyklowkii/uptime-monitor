const STATUS_MAP = {
  up: { label: 'Online', dot: 'bg-signal', text: 'text-signal' },
  down: { label: 'Down', dot: 'bg-critical', text: 'text-critical' },
  degraded: { label: 'Degraded', dot: 'bg-warn', text: 'text-warn' },
  unknown: { label: 'Not yet checked', dot: 'bg-idle', text: 'text-idle' },
};

export default function StatusBadge({ status, size = 'md' }) {
  const s = STATUS_MAP[status] || STATUS_MAP.unknown;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line ${pad} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export { STATUS_MAP };
