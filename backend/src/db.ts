import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'blogtell',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('✅ PostgreSQL connected');
}
