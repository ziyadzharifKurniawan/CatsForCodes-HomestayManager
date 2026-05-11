require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── In-memory activity log (persisted to log.json) ──────
const LOG_FILE   = path.join(__dirname, 'log.json');
const SAVES_FILE = path.join(__dirname, 'saves.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let activityLog = readJSON(LOG_FILE, []);
let saveSlots   = readJSON(SAVES_FILE, { current: null, slots: [null,null,null,null,null] });

function addLog(action, detail) {
  const entry = { ts: new Date().toISOString(), action, detail };
  activityLog.unshift(entry);
  if (activityLog.length > 200) activityLog = activityLog.slice(0, 200);
  writeJSON(LOG_FILE, activityLog);
  return entry;
}

// ── Helper: snapshot current DB ─────────────────────────
async function snapshotDB() {
  const { rows: bookings } = await pool.query('SELECT * FROM homestay_bookings ORDER BY id');
  const { rows: items }    = await pool.query('SELECT * FROM booking_line_items ORDER BY booking_id, id');
  return { bookings, items, ts: new Date().toISOString() };
}

// ── Helper: restore DB from snapshot ────────────────────
async function restoreDB(snapshot) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM booking_line_items');
    await client.query('DELETE FROM homestay_bookings');
    await client.query('ALTER SEQUENCE homestay_bookings_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE booking_line_items_id_seq RESTART WITH 1');

    for (const b of snapshot.bookings) {
      await client.query(
        `INSERT INTO homestay_bookings
           (id,booking_no,invoice_no,property,payment_method,guest_name,persons,
            check_in_date,month,stay_dates,nights,revenue_total,cost_plan_total,
            actual_cost_total,result_rp,remark,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [b.id,b.booking_no,b.invoice_no,b.property,b.payment_method,b.guest_name,
         b.persons,b.check_in_date,b.month,b.stay_dates,b.nights,b.revenue_total,
         b.cost_plan_total,b.actual_cost_total,b.result_rp,b.remark,b.created_at]
      );
    }
    for (const it of snapshot.items) {
      await client.query(
        `INSERT INTO booking_line_items
           (id,booking_id,detail_type,rev_satuan,rev_total,cost_qty,cost_plan_rp,actual_cost,owner_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [it.id,it.booking_id,it.detail_type,it.rev_satuan,it.rev_total,
         it.cost_qty,it.cost_plan_rp,it.actual_cost,it.owner_pct]
      );
    }

    // Reset sequences to max id + 1
    await client.query(`SELECT setval('homestay_bookings_id_seq', COALESCE((SELECT MAX(id) FROM homestay_bookings),0)+1, false)`);
    await client.query(`SELECT setval('booking_line_items_id_seq', COALESCE((SELECT MAX(id) FROM booking_line_items),0)+1, false)`);
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

// ── GET all bookings + line items ────────────────────────
app.get('/api/bookings', async (req, res) => {
  try {
    const { rows: bookings } = await pool.query('SELECT * FROM homestay_bookings ORDER BY check_in_date DESC NULLS LAST, id DESC');
    const { rows: items }    = await pool.query('SELECT * FROM booking_line_items ORDER BY booking_id, id');
    const map = {};
    for (const it of items) {
      if (!map[it.booking_id]) map[it.booking_id] = [];
      map[it.booking_id].push(it);
    }
    res.json({ success: true, data: bookings.map(b => ({ ...b, line_items: map[b.id] || [] })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST new booking ─────────────────────────────────────
app.post('/api/bookings', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      booking_no, invoice_no, property, payment_method, guest_name,
      persons, check_in_date, month, stay_dates, nights, remark,
      revenue_total_override, cost_plan_total_override, actual_cost_total_override,
      line_items = []
    } = req.body;

    const nonOwnerItems  = line_items.filter(i => i.detail_type !== 'Owner');
    const autoRev        = nonOwnerItems.reduce((s,i) => s+(Number(i.rev_total)||0), 0);
    const ownerItem      = line_items.find(i => i.detail_type === 'Owner');
    const ownerPct       = ownerItem?.owner_pct != null ? Number(ownerItem.owner_pct) : 5;
    const ownerCostAuto  = Math.round((autoRev * ownerPct) / 100);
    const ownerCost      = (ownerItem?.cost_plan_rp != null && ownerItem.cost_plan_rp !== 0)
      ? Number(ownerItem.cost_plan_rp) : ownerCostAuto;
    const revenue_total  = revenue_total_override != null ? Number(revenue_total_override) : (autoRev||null);
    const autoCostPlan   = line_items.reduce((s,i) => s+(i.detail_type==='Owner'?ownerCost:(Number(i.cost_plan_rp)||0)), 0);
    const cost_plan_total = cost_plan_total_override != null ? Number(cost_plan_total_override) : (autoCostPlan||null);
    const autoAC          = line_items.reduce((s,i) => s+(Number(i.actual_cost)||0), 0);
    const actual_cost_total = actual_cost_total_override != null ? Number(actual_cost_total_override) : (autoAC||null);
    const costForProfit   = (actual_cost_total && actual_cost_total>0) ? actual_cost_total : cost_plan_total;
    const result_rp       = (revenue_total != null && costForProfit != null) ? revenue_total - costForProfit : null;

    const { rows: [b] } = await client.query(
      `INSERT INTO homestay_bookings
         (booking_no,invoice_no,property,payment_method,guest_name,persons,
          check_in_date,month,stay_dates,nights,revenue_total,cost_plan_total,
          actual_cost_total,result_rp,remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [booking_no||null,invoice_no||null,property||null,payment_method||null,guest_name,
       persons||null,check_in_date||null,month||null,stay_dates||null,nights||null,
       revenue_total,cost_plan_total,actual_cost_total,result_rp,remark||null]
    );

    for (const it of line_items) {
      const isOwner = it.detail_type === 'Owner';
      await client.query(
        `INSERT INTO booking_line_items
           (booking_id,detail_type,rev_satuan,rev_total,cost_qty,cost_plan_rp,actual_cost,owner_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [b.id, it.detail_type, it.rev_satuan||null,
         isOwner ? null : (Number(it.rev_total)||null),
         it.cost_qty||null,
         isOwner ? ownerCost : (Number(it.cost_plan_rp)||null),
         Number(it.actual_cost)||null,
         isOwner ? ownerPct : null]
      );
    }
    await client.query('COMMIT');

    // Auto-update current snapshot + log
    snapshotDB().then(snap => { saveSlots.current = snap; writeJSON(SAVES_FILE, saveSlots); });
    const logEntry = addLog('ADD', `Booking #${booking_no||'?'}  ${guest_name} (Rp ${(revenue_total||0).toLocaleString('id-ID')})`);
    res.json({ success: true, data: { ...b, line_items }, log: logEntry });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// ── DELETE booking ───────────────────────────────────────
app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const { rows: [b] } = await pool.query('SELECT * FROM homestay_bookings WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM homestay_bookings WHERE id=$1', [req.params.id]);
    snapshotDB().then(snap => { saveSlots.current = snap; writeJSON(SAVES_FILE, saveSlots); });
    const logEntry = addLog('DELETE', `Booking #${b?.booking_no||'?'}  ${b?.guest_name||'unknown'} deleted`);
    res.json({ success: true, log: logEntry });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Stats ────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const { rows: [d] } = await pool.query(`
      SELECT COUNT(*) total_bookings,
        COALESCE(SUM(revenue_total),0)     total_revenue,
        COALESCE(SUM(cost_plan_total),0)   total_cost_plan,
        COALESCE(SUM(actual_cost_total),0) total_actual_cost,
        COALESCE(SUM(result_rp),0)         total_profit,
        COALESCE(SUM(persons),0)           total_guests
      FROM homestay_bookings`);
    res.json({ success: true, data: d });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET activity log ─────────────────────────────────────
app.get('/api/log', (req, res) => {
  res.json({ success: true, data: activityLog });
});

// ── GET save slots metadata ──────────────────────────────
app.get('/api/states', (req, res) => {
  const meta = {
    current: saveSlots.current ? { ts: saveSlots.current.ts, bookings: saveSlots.current.bookings.length } : null,
    slots: saveSlots.slots.map((s,i) => s ? { slot: i+1, ts: s.ts, bookings: s.bookings.length, label: s.label||null } : null)
  };
  res.json({ success: true, data: meta });
});

// ── POST save to slot (1-5) ──────────────────────────────
app.post('/api/states/:slot/save', async (req, res) => {
  const slot = parseInt(req.params.slot);
  if (slot < 1 || slot > 5) return res.status(400).json({ success: false, error: 'Slot must be 1-5' });
  try {
    const snap = await snapshotDB();
    snap.label = req.body.label || null;
    saveSlots.slots[slot-1] = snap;
    writeJSON(SAVES_FILE, saveSlots);
    const logEntry = addLog('SAVE', `State saved to Slot ${slot}${snap.label?' "'+snap.label+'"':''} (${snap.bookings.length} bookings)`);
    res.json({ success: true, log: logEntry });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST load from slot (0=current, 1-5=manual) ──────────
app.post('/api/states/:slot/load', async (req, res) => {
  const slot = parseInt(req.params.slot);
  const snap = slot === 0 ? saveSlots.current : saveSlots.slots[slot-1];
  if (!snap) return res.status(404).json({ success: false, error: 'No save in that slot' });
  try {
    await restoreDB(snap);
    const logEntry = addLog('LOAD', `Restored from ${slot===0?'Current State':'Slot '+slot}${snap.label?' "'+snap.label+'"':''} (${snap.bookings.length} bookings, saved ${new Date(snap.ts).toLocaleString()})`);
    res.json({ success: true, log: logEntry });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Debug ────────────────────────────────────────────────
app.get('/api/debug', async (req, res) => {
  const r = {};
  try { const {rows}=await pool.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_name IN ('homestay_bookings','booking_line_items') ORDER BY table_name,ordinal_position`); r.schema=rows; } catch(e){ r.schema_error=e.message; }
  try { const {rows}=await pool.query('SELECT COUNT(*) n FROM homestay_bookings'); r.bookings=rows[0].n; } catch(e){ r.bookings_error=e.message; }
  try { const {rows}=await pool.query('SELECT COUNT(*) n FROM booking_line_items'); r.line_items=rows[0].n; } catch(e){ r.line_items_error=e.message; }
  res.json(r);
});

app.delete('/api/log', (req, res) => {
  activityLog = [];
  writeJSON(LOG_FILE, activityLog);
  res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`✓  PetRa Homestay → http://localhost:${process.env.PORT || 3000}`)
);