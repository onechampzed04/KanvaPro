require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    const res = await pool.query(`SELECT uploaded_by, SUM(file_size) as total_bytes FROM assets WHERE type = 'image' OR type = 'font' GROUP BY uploaded_by`);
    await pool.query('UPDATE users SET storage_used_bytes = 0');
    for (const row of res.rows) {
      if (row.uploaded_by) {
        await pool.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [row.total_bytes, row.uploaded_by]);
      }
    }
    console.log('Successfully synced user storage bytes for', res.rows.length, 'users!');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
