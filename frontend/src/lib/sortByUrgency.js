// Down sites float to the top, then degraded, then not-yet-checked, then
// healthy sites last - so the one thing that needs action is always the
// first thing you see, instead of being buried alphabetically among sites
// that are fine. Same status sorts alphabetically by name underneath that,
// so the order stays stable and predictable rather than jumping around.
const STATUS_PRIORITY = { down: 0, degraded: 1, unknown: 2, up: 3 };

export function sortByUrgency(sites) {
  return [...sites].sort((a, b) => {
    const priorityDiff = (STATUS_PRIORITY[a.current_status] ?? 99) - (STATUS_PRIORITY[b.current_status] ?? 99);
    if (priorityDiff !== 0) return priorityDiff;
    return (a.name || '').localeCompare(b.name || '');
  });
}