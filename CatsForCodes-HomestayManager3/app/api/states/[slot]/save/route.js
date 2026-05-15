import { NextResponse } from 'next/server';
import { addLog, getSaveSlots, setSaveSlots, snapshotDB } from '@/lib/stateStore';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { slot: slotParam } = await params;
  const slot = Number(slotParam);
  if (slot < 1 || slot > 5) {
    return NextResponse.json({ success: false, error: 'Slot must be 1-5' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const saveSlots = getSaveSlots();
    const snapshot = await snapshotDB();
    snapshot.label = body.label || null;
    saveSlots.slots[slot - 1] = snapshot;
    setSaveSlots(saveSlots);
    const logEntry = addLog('SAVE', `State saved to Slot ${slot}${snapshot.label ? ` "${snapshot.label}"` : ''} (${snapshot.bookings.length} bookings)`);
    return NextResponse.json({ success: true, log: logEntry });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
