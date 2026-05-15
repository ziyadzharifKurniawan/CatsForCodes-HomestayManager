import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const result = {};
  try {
    const { rows } = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('homestay_bookings','booking_line_items')
      ORDER BY table_name, ordinal_position`);
    result.schema = rows;
  } catch (err) {
    result.schema_error = err.message;
  }

  try {
    const { rows } = await pool.query('SELECT COUNT(*) n FROM homestay_bookings');
    result.bookings = rows[0].n;
  } catch (err) {
    result.bookings_error = err.message;
  }

  try {
    const { rows } = await pool.query('SELECT COUNT(*) n FROM booking_line_items');
    result.line_items = rows[0].n;
  } catch (err) {
    result.line_items_error = err.message;
  }

  return NextResponse.json(result);
}
