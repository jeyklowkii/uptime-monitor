// The downtime totals themselves are calculated in the database
// (supabase/migrations/20260101000004_fleet_downtime_and_faster_analytics.sql)
// - this file only turns a number of seconds into something readable.

// 0 -> "0m", 45 -> "45s", 600 -> "10m", 8100 -> "2h 15m", 100000 -> "1d 3h 46m"
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s === 0) return '0m';
  if (s < 60) return `${s}s`;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}