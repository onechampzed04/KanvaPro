import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          actor_id uuid REFERENCES public.users(id),
          action_type text NOT NULL,
          description text NOT NULL,
          ip_address text,
          created_at timestamp with time zone DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_id ON public.admin_audit_logs(actor_id);
    `);
    console.log('Created admin_audit_logs successfully');
  } catch (err) {
    console.error('Error creating admin_audit_logs:', err);
  } finally {
    pool.end();
  }
}

run();
