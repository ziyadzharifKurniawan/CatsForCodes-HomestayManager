require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// GET all bookings + line items
app.get('/api/bookings', async (req, res) => {
  try {
    const { rows: bookings } = await pool.query(
      'SELECT * FROM homestay_bookings ORDER BY check_in_date DESC NULLS LAST, id DESC'
    );
    const { rows: items } = await pool.query(
      'SELECT * FROM booking_line_items ORDER BY booking_id, id'
    );
    const map = {};
    for (const it of items) {
      if (!map[it.booking_id]) map[it.booking_id] = [];
      map[it.booking_id].push(it);
    }
    res.json({ success: true, data: bookings.map(b => ({ ...b, line_items: map[b.id] || [] })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST new booking with line items — totals auto-calculated, or use manual override
app.post('/api/bookings', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      booking_no, invoice_no, property, payment_method, guest_name,
      persons, check_in_date, month, stay_dates, nights, remark,
      revenue_total_override, cost_total_override, actual_cost_total, result_rp_override,
      line_items = []
    } = req.body;

    // Auto-calc from line items; allow manual override
    const autoRev  = line_items.reduce((s, i) => s + (Number(i.rev_total)  || 0), 0);
    const autoCost = line_items.reduce((s, i) => s + (Number(i.cost_rp)    || 0), 0);
    const autoAC   = line_items.reduce((s, i) => s + (Number(i.actual_cost)|| 0), 0);

    const revenue_total     = revenue_total_override  != null ? Number(revenue_total_override)  : (autoRev  || null);
    const cost_total        = cost_total_override     != null ? Number(cost_total_override)     : (autoCost || null);
    const actual_cost_total_val = actual_cost_total   != null ? Number(actual_cost_total)       : (autoAC   || null);
    const result_rp         = result_rp_override      != null ? Number(result_rp_override)
                            : (revenue_total != null && cost_total != null ? revenue_total - cost_total : null);

    const { rows: [b] } = await client.query(
      `INSERT INTO homestay_bookings
         (booking_no,invoice_no,property,payment_method,guest_name,persons,
          check_in_date,month,stay_dates,nights,revenue_total,cost_total,actual_cost_total,result_rp,remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [booking_no||null, invoice_no||null, property||null, payment_method||null, guest_name,
       persons||null, check_in_date||null, month||null, stay_dates||null, nights||null,
       revenue_total, cost_total, actual_cost_total_val, result_rp, remark||null]
    );

    for (const it of line_items) {
      await client.query(
        `INSERT INTO booking_line_items (booking_id,detail_type,rev_satuan,rev_total,cost_qty,cost_rp,actual_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [b.id, it.detail_type, it.rev_satuan||null, it.rev_total||null,
         it.cost_qty||null, it.cost_rp||null, it.actual_cost||null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { ...b, line_items } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// DELETE booking (cascades to line items via FK)
app.delete('/api/bookings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM homestay_bookings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Stats overview
app.get('/api/stats', async (req, res) => {
  try {
    const { rows: [d] } = await pool.query(`
      SELECT
        COUNT(*)                        AS total_bookings,
        COALESCE(SUM(revenue_total),0)  AS total_revenue,
        COALESCE(SUM(cost_total),0)     AS total_cost,
        COALESCE(SUM(actual_cost_total),0) AS total_actual_cost,
        COALESCE(SUM(result_rp),0)      AS total_profit,
        COALESCE(SUM(persons),0)        AS total_guests
      FROM homestay_bookings`);
    res.json({ success: true, data: d });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`✓  PetRa Homestay app → http://localhost:${process.env.PORT || 3000}`)
);
