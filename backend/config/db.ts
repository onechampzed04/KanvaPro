import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database Interface
export interface DBAdapter {
  query(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<any>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// PostgreSQL Implementation
class PostgresAdapter implements DBAdapter {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL || 'postgres://postgres:123123@localhost:5432/KanvaPro';
    this.pool = new Pool({
      connectionString,
    });
    console.log('PostgreSQL Adapter Initialized');
  }

  private normalizeSql(sql: string): string {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    const res = await this.pool.query(this.normalizeSql(sql), params);
    return res.rows;
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const res = await this.pool.query(this.normalizeSql(sql), params);
    return res.rows[0];
  }

  async run(sql: string, params: any[] = []): Promise<any> {
    const res = await this.pool.query(this.normalizeSql(sql), params);
    return { rowCount: res.rowCount };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export a single Postgres instance
const db: DBAdapter = new PostgresAdapter();

export default db;
