import db from '../config/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await db.query(schema); // Postgres dùng query cho tất cả
      console.log('✅ Schema applied.');
    }

    const migration007Path = path.join(__dirname, 'migrations', '007_ai_tokens_and_packages.sql');
    if (fs.existsSync(migration007Path)) {
      const sql = fs.readFileSync(migration007Path, 'utf8');
      await db.query(sql);
      console.log('✅ Migration 007_ai_tokens_and_packages applied.');
    }

    const demoEmail = 'demo@example.com';
    // ĐỔI THÀNH $1
    const existingUser = await db.getOne('SELECT * FROM users WHERE email = $1', [demoEmail]);

    if (!existingUser) {
      console.log('Creating demo user...');
      const id = uuidv4();
      const passwordHash = await bcrypt.hash('password', 10);
      
      // ĐỔI THÀNH $1, $2, $3, $4, $5
      await db.execute(`
        INSERT INTO users (id, email, password_hash, name, role)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, demoEmail, passwordHash, 'Demo User', 'user']);
    }
  } catch (error) {
    console.error('❌ Database init failed:', error);
  }
}