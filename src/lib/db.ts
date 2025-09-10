import { Pool } from "pg";

// Shared Postgres pool for the whole app
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

declare global {
  var __sharedPgPool__: Pool | undefined;
}

export const pool: Pool = global.__sharedPgPool__
  ? global.__sharedPgPool__
  : new Pool(connectionString ? { connectionString } : undefined);

if (!global.__sharedPgPool__) {
  global.__sharedPgPool__ = pool;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export async function query<T = unknown>(
  text: string,
  params?: readonly unknown[]
): Promise<QueryResult<T>> {
  const res = await pool.query(text, params as unknown as any);
  return { rows: res.rows as unknown as T[], rowCount: res.rowCount };
}
