const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:123456@localhost:5432/KanvaPro' });

async function fix() {
  try {
    await pool.query('ALTER TABLE admin_audit_logs ALTER COLUMN ip_address TYPE character varying(64);');
    console.log('Altered admin_audit_logs ip_address to varchar(64)');
    
    // Also change team_audit_logs just in case
    await pool.query('ALTER TABLE team_audit_logs ALTER COLUMN ip_address TYPE character varying(64);');
    console.log('Altered team_audit_logs ip_address to varchar(64)');
  } catch (err) {
    console.error(err.message);
  } finally {
    pool.end();
  }
}
fix();
