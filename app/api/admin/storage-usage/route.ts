import { NextResponse } from "next/server";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plan gratis de Supabase Storage: 1 GB. Si algún día cambias de plan,
// ajusta este número.
const LIMIT_BYTES = 1024 * 1024 * 1024;

async function sumFolderBytes(supabase: ReturnType<typeof getSupabaseAdmin>, prefix: string) {
  let total = 0;
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .list(prefix, { limit, offset });

    if (error || !data || data.length === 0) break;

    for (const item of data) {
      total += (item.metadata as any)?.size || 0;
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return total;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [originalsBytes, signedBytes] = await Promise.all([
      sumFolderBytes(supabase, "originals"),
      sumFolderBytes(supabase, "signed"),
    ]);

    const usedBytes = originalsBytes + signedBytes;
    const percent = Math.min(100, Math.round((usedBytes / LIMIT_BYTES) * 100));

    return NextResponse.json({ usedBytes, limitBytes: LIMIT_BYTES, percent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}
