const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:123456@localhost:5432/KanvaPro' });

pool.query("SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'admin_audit_logs'")
  .then(res => {
    console.table(res.rows);
    pool.end();
  });
