// In-memory stand-in for the Supabase JS client used by route tests. It never touches the network.
type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export type FakeDatabase = {
  tables: Record<string, Row[]>;
  rpcCalls: Array<{ name: string; args: Row }>;
  rpcHandlers: Record<string, (args: Row) => { data: unknown; error: { message: string } | null }>;
  /** Joins resolved for select strings such as 'profiles!inner(user_id)'. */
  joins: Record<string, (row: Row) => Row | null>;
};

export function createFakeDatabase(): FakeDatabase {
  return { tables: {}, rpcCalls: [], rpcHandlers: {}, joins: {} };
}

class Query implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = [];
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | Row[] | null = null;
  private selectColumns = '*';
  private singleMode: 'none' | 'single' | 'maybe' = 'none';

  constructor(private readonly db: FakeDatabase, private readonly table: string) {}

  select(columns = '*') { this.selectColumns = columns; return this; }
  insert(payload: Row | Row[]) { this.mode = 'insert'; this.payload = payload; return this; }
  update(payload: Row) { this.mode = 'update'; this.payload = payload; return this; }
  upsert(payload: Row, options: { onConflict: string }) {
    const existing = this.rows().find((row) => row[options.onConflict] === payload[options.onConflict]);
    if (existing) { this.mode = 'update'; this.payload = payload; this.filters.push((row) => row[options.onConflict] === payload[options.onConflict]); }
    else { this.mode = 'insert'; this.payload = payload; }
    return this;
  }
  eq(column: string, value: unknown) { this.filters.push((row) => readPath(row, column) === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => readPath(row, column) !== value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(readPath(row, column))); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => (readPath(row, column) ?? null) === value); return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }

  then<A, B>(onfulfilled?: ((value: any) => A | PromiseLike<A>) | null, onrejected?: ((reason: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private rows() { return (this.db.tables[this.table] ||= []); }

  private withJoins(row: Row) {
    const joined = { ...row };
    for (const [name, resolve] of Object.entries(this.db.joins)) {
      if (this.selectColumns.includes(`${name}!inner`) || this.selectColumns.includes(`${name}(`)) joined[name] = resolve(row);
    }
    return joined;
  }

  private execute() {
    if (this.mode === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((row) => ({
        id: row.id || `fake-${this.table}-${this.rows().length + 1}`,
        status: this.table === 'booking_requests' ? 'pending' : undefined,
        created_at: new Date().toISOString(),
        ...row
      }));
      this.rows().push(...inserted);
      return this.shape(inserted);
    }
    const matched = this.rows().map((row) => this.withJoins(row)).filter((row) => this.filters.every((filter) => filter(row)));
    if (this.mode === 'update') {
      const ids = new Set(matched.map((row) => row.id));
      for (const row of this.rows()) if (ids.has(row.id)) Object.assign(row, this.payload);
      return this.shape(this.rows().filter((row) => ids.has(row.id)));
    }
    return this.shape(matched);
  }

  private shape(rows: Row[]) {
    if (this.singleMode === 'none') return { data: rows, error: null };
    if (rows.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' } };
    if (!rows.length) return this.singleMode === 'single'
      ? { data: null, error: { message: 'no rows', code: 'PGRST116' } }
      : { data: null, error: null };
    return { data: rows[0], error: null };
  }
}

function readPath(row: Row, column: string) {
  return column.split('.').reduce<any>((value, key) => (value == null ? undefined : value[key]), row);
}

/** Replaces the data methods of the real (offline-configured) clients with the fake database. */
export function installFakeSupabase(clients: { supabaseAdmin: any; supabaseAnon: any }, db: FakeDatabase, users: Record<string, Row>) {
  clients.supabaseAdmin.from = (table: string) => new Query(db, table);
  clients.supabaseAdmin.rpc = async (name: string, args: Row) => {
    db.rpcCalls.push({ name, args });
    const handler = db.rpcHandlers[name];
    return handler ? handler(args) : { data: null, error: { message: `UNEXPECTED_RPC_${name}` } };
  };
  clients.supabaseAnon.auth.getUser = async (token: string) => {
    const user = users[token];
    return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
  };
}
