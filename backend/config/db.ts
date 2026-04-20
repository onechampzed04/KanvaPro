import { Pool } from 'pg';
import dotenv from 'dotenv';

// 1. ÉP HỆ THỐNG PHẢI ĐỌC FILE .ENV NGAY LẬP TỨC TẠI DÒNG NÀY
dotenv.config();

const connectionString = process.env.DATABASE_URL;

// 2. CHECK XEM ĐÃ ĐỌC ĐƯỢC CHƯA? NẾU CHƯA THÌ BÁO LỖI VÀ DỪNG SERVER LUÔN
if (!connectionString) {
  console.error("❌ LỖI NGHIÊM TRỌNG: Không tìm thấy biến DATABASE_URL trong file .env!");
  console.error("👉 Hãy kiểm tra lại xem file .env có nằm đúng ở thư mục 'backend' không nhé.");
  process.exit(1); 
}

const pool = new Pool({
  connectionString,
});

// Kiểm tra kết nối khi khởi động
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL on Neon.tech!');
});

export default {
  connect: () => pool.connect(),
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