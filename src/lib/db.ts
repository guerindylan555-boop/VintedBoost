import { Pool } from "pg";

// Shared Postgres pool for the whole app
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __sharedPgPool__: Pool | undefined;
}

export const pool: Pool = global.__sharedPgPool__
  ? global.__sharedPgPool__
  : new Pool(connectionString ? { connectionString } : undefined);

if (!global.__sharedPgPool__) {
  global.__sharedPgPool__ = pool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number } & unknown> {
  const res = await pool.query(text, params as any);
  return res as any;
}
