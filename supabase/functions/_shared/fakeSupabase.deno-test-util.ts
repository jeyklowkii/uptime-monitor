// A tiny stand-in for the slice of supabase-js's query builder this project
// uses: .from(table).select().eq().eq().limit().maybeSingle(), plain
// .insert(), .insert().select().single(), and .update().eq(). Not a general
// Supabase mock - just enough surface to run incidentService.ts's actual
// read/write sequence for real (under Deno, not Node) and prove the
// duplicate-prevention logic works against Supabase-shaped calls, not just
// the pure reducer in statusEngine.ts.
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export function createFakeSupabase() {
  const tables = new Map<string, Row[]>();
  let idCounter = 0;

  function rowsFor(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  function selectBuilder(rows: Row[], filters: Array<[string, unknown]>) {
    return {
      eq(field: string, value: unknown) {
        return selectBuilder(rows, [...filters, [field, value]]);
      },
      limit(_n: number) {
        return this;
      },
      maybeSingle() {
        const match = rows.find((r) => filters.every(([f, v]) => r[f] === v));
        return Promise.resolve({ data: match ?? null, error: null });
      },
      single() {
        const match = rows.find((r) => filters.every(([f, v]) => r[f] === v));
        return match
          ? Promise.resolve({ data: { ...match }, error: null })
          : Promise.resolve({ data: null, error: new Error('not found') });
      },
    };
  }

  function from(name: string) {
    const rows = rowsFor(name);

    return {
      select(_cols = '*') {
        return selectBuilder(rows, []);
      },
      insert(data: Row) {
        const id = data.id ?? `fake-${++idCounter}`;
        const row = { id, ...data };
        rows.push(row);
        // supabase-js's insert() is "thenable" (awaitable directly) AND
        // chainable (.select().single()) - replicate both.
        return {
          then(onFulfilled: (v: { data: null; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
          },
          select() {
            return {
              single() {
                return Promise.resolve({ data: { ...row }, error: null });
              },
            };
          },
        };
      },
      update(patch: Row) {
        return {
          eq(field: string, value: unknown) {
            const idx = rows.findIndex((r) => r[field] === value);
            if (idx === -1) return Promise.resolve({ error: new Error(`No such row: ${name}.${field}=${value}`) });
            rows[idx] = { ...rows[idx], ...patch };
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }

  return {
    from,
    _reset() {
      tables.clear();
      idCounter = 0;
    },
    _table(name: string) {
      return rowsFor(name);
    },
  };
}
