import fs from 'fs';
import path from 'path';
import { pool } from './db';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOG_FILE = path.join(DATA_DIR, 'log.json');
const SAVES_FILE = path.join(DATA_DIR, 'saves.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '[]');
  if (!fs.existsSync(SAVES_FILE)) fs.writeFileSync(SAVES_FILE, JSON.stringify({ current: null, slots: [null, null, null, null, null] }, null, 2));
}

export function readJSON(file, fallback) {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data) {
  ensureDataFiles();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getActivityLog() {
  return readJSON(LOG_FILE, []);
}

export function setActivityLog(log) {
  writeJSON(LOG_FILE, log);
}

export function getSaveSlots() {
  return readJSON(SAVES_FILE, { current: null, slots: [null, null, null, null, null] });
}

export function setSaveSlots(slots) {
  writeJSON(SAVES_FILE, slots);
}

export function addLog(action, detail) {
  const entry = { ts: new Date().toISOString(), action, detail };
  const log = getActivityLog();
  log.unshift(entry);
  setActivityLog(log.slice(0, 200));
  return entry;
}

export async function snapshotDB() {
  const { rows: bookings } = await pool.query('SELECT * FROM homestay_bookings ORDER BY id');
  const { rows: items } = await pool.query('SELECT * FROM booking_line_items ORDER BY booking_id, id');
  return { bookings, items, ts: new Date().toISOString() };
}

export async function saveCurrentSnapshot() {
  const saveSlots = getSaveSlots();
  saveSlots.current = await snapshotDB();
  setSaveSlots(saveSlots);
  return saveSlots.current;
}

export async function restoreDB(snapshot) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM booking_line_items');
    await client.query('DELETE FROM homestay_bookings');
    await client.query('ALTER SEQUENCE homestay_bookings_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE booking_line_items_id_seq RESTART WITH 1');

    for (const booking of snapshot.bookings || []) {
      await client.query(
        `INSERT INTO homestay_bookings
           (id, booking_no, invoice_no, property, payment_method, guest_name, persons,
            check_in_date, month, stay_dates, nights, revenue_total, cost_plan_total,
            actual_cost_total, result_rp, remark, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          booking.id,
          booking.booking_no,
          booking.invoice_no,
          booking.property,
          booking.payment_method,
          booking.guest_name,
          booking.persons,
          booking.check_in_date,
          booking.month,
          booking.stay_dates,
          booking.nights,
          booking.revenue_total,
          booking.cost_plan_total,
          booking.actual_cost_total,
          booking.result_rp,
          booking.remark,
          booking.created_at,
        ],
      );
    }

    for (const item of snapshot.items || []) {
      await client.query(
        `INSERT INTO booking_line_items
           (id, booking_id, detail_type, rev_satuan, rev_total, cost_qty, cost_plan_rp, actual_cost, owner_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          item.id,
          item.booking_id,
          item.detail_type,
          item.rev_satuan,
          item.rev_total,
          item.cost_qty,
          item.cost_plan_rp,
          item.actual_cost,
          item.owner_pct,
        ],
      );
    }

    await client.query("SELECT setval('homestay_bookings_id_seq', COALESCE((SELECT MAX(id) FROM homestay_bookings),0)+1, false)");
    await client.query("SELECT setval('booking_line_items_id_seq', COALESCE((SELECT MAX(id) FROM booking_line_items),0)+1, false)");
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
