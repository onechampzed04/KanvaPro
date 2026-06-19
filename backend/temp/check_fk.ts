import { Pool } from 'pg';

const pool = new Pool({ connectionString: 'postgres://postgres:123123@localhost:5432/KanvaPro' });

async function check() {
  try {
    const res = await pool.query(`
      SELECT 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='designs';
    `);
    console.log('Foreign Keys for designs table:', JSON.stringify(res.rows, null, 2));

    const foldersRes = await pool.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='folders';
    `);
    console.log('Folders table exists:', foldersRes.rows.length > 0);

    const designCols = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name='designs';
    `);
    console.log('Design columns:', designCols.rows.map(r => r.column_name).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
check();
