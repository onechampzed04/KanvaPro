import { Pool } from 'pg';
import 'dotenv/config'; // Đảm bảo load env ngay tại đây

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

// Kiểm tra kết nối khi khởi động
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

export default {
  // Dùng thuần query của pg
  query: (text: string, params?: any[]) => pool.query(text, params),
  
  // Hàm tiện ích để lấy 1 dòng (giống db.get cũ)
  async getOne(text: string, params?: any[]) {
    const res = await pool.query(text, params);
    return res.rows[0];
  },

  // Hàm thực thi không cần trả về row (giống db.run cũ)
  async execute(text: string, params?: any[]) {
    const res = await pool.query(text, params);
    return { rowCount: res.rowCount };
  },

  close: () => pool.end(),
};