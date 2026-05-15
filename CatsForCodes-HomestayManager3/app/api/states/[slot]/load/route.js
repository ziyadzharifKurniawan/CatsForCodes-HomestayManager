import { NextResponse } from 'next/server';
import { addLog, getSaveSlots, restoreDB } from '@/lib/stateStore';

export const runtime = 'nodejs';

export async function POST(_request, { params }) {
  const { slot: slotParam } = await params;
  const slot = Number(slotParam);
  const saveSlots = getSaveSlots();
  const snapshot = slot === 0 ? saveSlots.current : saveSlots.slots[slot - 1];

  if (!snapshot) {
    return NextResponse.json({ success: false, error: 'No save in that slot' }, { status: 404 });
  }

  try {
    await restoreDB(snapshot);
    const logEntry = addLog('LOAD', `Restored from ${slot === 0 ? 'Current State' : `Slot ${slot}`}${snapshot.label ? ` "${snapshot.label}"` : ''} (${snapshot.bookings.length} bookings, saved ${new Date(snapshot.ts).toLocaleString()})`);
    return NextResponse.json({ success: true, log: logEntry });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
