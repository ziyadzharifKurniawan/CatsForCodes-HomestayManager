import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { addLog, saveCurrentSnapshot } from '@/lib/stateStore';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { rows: bookings } = await pool.query('SELECT * FROM homestay_bookings ORDER BY check_in_date DESC NULLS LAST, id DESC');
    const { rows: items } = await pool.query('SELECT * FROM booking_line_items ORDER BY booking_id, id');
    const itemMap = {};

    for (const item of items) {
      if (!itemMap[item.booking_id]) itemMap[item.booking_id] = [];
      itemMap[item.booking_id].push(item);
    }

    return NextResponse.json({
      success: true,
      data: bookings.map((booking) => ({ ...booking, line_items: itemMap[booking.id] || [] })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const client = await pool.connect();

  try {
    const body = await request.json();
    await client.query('BEGIN');

    const {
      booking_no,
      invoice_no,
      property,
      payment_method,
      guest_name,
      persons,
      check_in_date,
      month,
      stay_dates,
      nights,
      remark,
      revenue_total_override,
      cost_plan_total_override,
      actual_cost_total_override,
      line_items = [],
    } = body;

    const nonOwnerItems = line_items.filter((item) => item.detail_type !== 'Owner');
    const autoRevenue = nonOwnerItems.reduce((sum, item) => sum + (Number(item.rev_total) || 0), 0);
    const ownerItem = line_items.find((item) => item.detail_type === 'Owner');
    const ownerPct = ownerItem?.owner_pct != null ? Number(ownerItem.owner_pct) : 5;
    const ownerCostAuto = Math.round((autoRevenue * ownerPct) / 100);
    const ownerCost = ownerItem?.cost_plan_rp != null && ownerItem.cost_plan_rp !== 0
      ? Number(ownerItem.cost_plan_rp)
      : ownerCostAuto;

    const revenue_total = revenue_total_override != null ? Number(revenue_total_override) : (autoRevenue || null);
    const autoCostPlan = line_items.reduce(
      (sum, item) => sum + (item.detail_type === 'Owner' ? ownerCost : (Number(item.cost_plan_rp) || 0)),
      0,
    );
    const cost_plan_total = cost_plan_total_override != null ? Number(cost_plan_total_override) : (autoCostPlan || null);
    const autoActualCost = line_items.reduce((sum, item) => sum + (Number(item.actual_cost) || 0), 0);
    const actual_cost_total = actual_cost_total_override != null ? Number(actual_cost_total_override) : (autoActualCost || null);
    const costForProfit = actual_cost_total && actual_cost_total > 0 ? actual_cost_total : cost_plan_total;
    const result_rp = revenue_total != null && costForProfit != null ? revenue_total - costForProfit : null;

    const { rows: [booking] } = await client.query(
      `INSERT INTO homestay_bookings
         (booking_no, invoice_no, property, payment_method, guest_name, persons,
          check_in_date, month, stay_dates, nights, revenue_total, cost_plan_total,
          actual_cost_total, result_rp, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        booking_no || null,
        invoice_no || null,
        property || null,
        payment_method || null,
        guest_name,
        persons || null,
        check_in_date || null,
        month || null,
        stay_dates || null,
        nights || null,
        revenue_total,
        cost_plan_total,
        actual_cost_total,
        result_rp,
        remark || null,
      ],
    );

    for (const item of line_items) {
      const isOwner = item.detail_type === 'Owner';
      await client.query(
        `INSERT INTO booking_line_items
           (booking_id, detail_type, rev_satuan, rev_total, cost_qty, cost_plan_rp, actual_cost, owner_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          booking.id,
          item.detail_type,
          item.rev_satuan || null,
          isOwner ? null : (Number(item.rev_total) || null),
          item.cost_qty || null,
          isOwner ? ownerCost : (Number(item.cost_plan_rp) || null),
          Number(item.actual_cost) || null,
          isOwner ? ownerPct : null,
        ],
      );
    }

    await client.query('COMMIT');
    saveCurrentSnapshot().catch(console.error);
    const logEntry = addLog('ADD', `Booking #${booking_no || '?'}  ${guest_name} (Rp ${(revenue_total || 0).toLocaleString('id-ID')})`);

    return NextResponse.json({ success: true, data: { ...booking, line_items }, log: logEntry });
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
