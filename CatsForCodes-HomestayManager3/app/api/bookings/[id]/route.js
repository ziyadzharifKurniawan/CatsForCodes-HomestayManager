import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { addLog, saveCurrentSnapshot } from '@/lib/stateStore';

export const runtime = 'nodejs';

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const { rows: [booking] } = await pool.query('SELECT * FROM homestay_bookings WHERE id=$1', [id]);
    await pool.query('DELETE FROM homestay_bookings WHERE id=$1', [id]);
    saveCurrentSnapshot().catch(console.error);
    const logEntry = addLog('DELETE', `Booking #${booking?.booking_no || '?'}  ${booking?.guest_name || 'unknown'} deleted`);
    return NextResponse.json({ success: true, log: logEntry });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
