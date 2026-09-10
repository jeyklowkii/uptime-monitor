const COLOR = {
  up: '#35D399',
  down: '#FB5A5A',
  degraded: '#F5B94D',
  unknown: '#3A4661',
};

/**
 * Renders `ticks` (oldest -> newest) as a row of bars, like an EKG strip.
 * Most recent tick is slightly taller and fully opaque; older ticks fade
 * out, so the eye lands on "what's happening now" first.
 */
export default function PulseStrip({ ticks = [], height = 28, barWidth = 4, gap = 2 }) {
  const width = ticks.length * (barWidth + gap);
  if (ticks.length === 0) {
    return <div className="text-xs text-muted">No checks yet</div>;
  }

  return (
    <svg width={width} height={height} className="overflow-visible" role="img" aria-label="Recent check history">
      {ticks.map((status, i) => {
        const isLast = i === ticks.length - 1;
        const h = isLast ? height : status === 'down' ? height * 0.85 : height * 0.55;
        const y = (height - h) / 2;
        const distanceFromEnd = ticks.length - 1 - i;
        const opacity = Math.max(0.28, 1 - distanceFromEnd * 0.07);
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={y}
            width={barWidth}
            height={h}
            rx={barWidth / 2}
            fill={COLOR[status] || COLOR.unknown}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}
