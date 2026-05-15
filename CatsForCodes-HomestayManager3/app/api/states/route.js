import { NextResponse } from 'next/server';
import { getSaveSlots } from '@/lib/stateStore';

export const runtime = 'nodejs';

export async function GET() {
  const saveSlots = getSaveSlots();
  const meta = {
    current: saveSlots.current ? { ts: saveSlots.current.ts, bookings: saveSlots.current.bookings.length } : null,
    slots: saveSlots.slots.map((slot, index) =>
      slot ? { slot: index + 1, ts: slot.ts, bookings: slot.bookings.length, label: slot.label || null } : null,
    ),
  };

  return NextResponse.json({ success: true, data: meta });
}
