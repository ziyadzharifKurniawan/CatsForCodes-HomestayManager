import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { rows: [data] } = await pool.query(`
      SELECT COUNT(*) total_bookings,
        COALESCE(SUM(revenue_total),0)     total_revenue,
        COALESCE(SUM(cost_plan_total),0)   total_cost_plan,
        COALESCE(SUM(actual_cost_total),0) total_actual_cost,
        COALESCE(SUM(result_rp),0)         total_profit,
        COALESCE(SUM(persons),0)           total_guests
      FROM homestay_bookings`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
