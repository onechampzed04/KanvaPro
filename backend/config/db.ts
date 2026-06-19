import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Không tìm thấy biến DATABASE_URL trong file .env!");
  console.error("Check env");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL on Neon.tech!');
});

export default {
  connect: () => pool.connect(),
  query: (text: string, params?: any[]) => pool.query(text, params),

  async getOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const res = await pool.query(text, params);
    return res.rows[0] ?? null;
  },

  async execute(text: string, params?: any[]) {
    const res = await pool.query(text, params);
    return { rowCount: res.rowCount };
  },

  close: () => pool.end(),
};
