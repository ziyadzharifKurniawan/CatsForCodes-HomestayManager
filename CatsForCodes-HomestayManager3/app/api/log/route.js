import { NextResponse } from 'next/server';
import { getActivityLog, setActivityLog } from '@/lib/stateStore';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ success: true, data: getActivityLog() });
}

export async function DELETE() {
  setActivityLog([]);
  return NextResponse.json({ success: true });
}
