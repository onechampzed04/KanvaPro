import db from '../config/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  console.log('Initializing PostgreSQL database...');

  try {
    // Load Postgres Schema from the local backend/db directory
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await db.exec(schema);
      console.log('PostgreSQL schema applied successfully.');
    } else {
      console.error('CRITICAL: Schema file not found at', schemaPath);
      return;
    }

    // Seed Demo User
    const demoEmail = 'demo@example.com';
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [demoEmail]);
    if (!existingUser) {
      console.log('Creating demo user...');
      const id = uuidv4();
      const passwordHash = await bcrypt.hash('password', 10);
      
      await db.run(`
        INSERT INTO users (id, email, password_hash, name, role)
        VALUES (?, ?, ?, ?, ?)
      `, [id, demoEmail, passwordHash, 'Demo User', 'user']);
    }

    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}
