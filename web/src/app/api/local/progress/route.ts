import { NextResponse } from 'next/server';
import {
  applyLocalProgressAction,
  readLocalProgressState,
  type LocalProgressAction,
} from '@/lib/local-progress-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const errorResponse = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function GET() {
  const state = await readLocalProgressState();
  return NextResponse.json({ data: state });
}

export async function POST(request: Request) {
  let body: LocalProgressAction;
  try {
    body = (await request.json()) as LocalProgressAction;
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object' || typeof body.action !== 'string') {
    return errorResponse(400, 'invalid_request', 'Missing progress action');
  }

  try {
    const result = await applyLocalProgressAction(body);
    return NextResponse.json({ data: result }, { status: body.action === 'create_task' ? 201 : 200 });
  } catch (error) {
    console.error('[LocalProgress] action failed:', error);
    return errorResponse(500, 'internal_error', 'Failed to update local progress');
  }
}
