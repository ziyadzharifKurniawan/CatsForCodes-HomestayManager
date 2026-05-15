import pg from 'pg';

const { Pool } = pg;

let pool;

if (!globalThis.__petraPool) {
  globalThis.__petraPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  });
}

pool = globalThis.__petraPool;

export { pool };
