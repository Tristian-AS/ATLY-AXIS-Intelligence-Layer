import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { updateMemory } from "@/lib/functions/updateMemory";
import { listWiki, readWiki } from "@/lib/memory";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const path = req.nextUrl.searchParams.get("path");
  if (path) {
    try {
      const content = await readWiki(path);
      return NextResponse.json({ path, content });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 404 });
    }
  }
  const dir = req.nextUrl.searchParams.get("dir") ?? "";
  const [entries, notes] = await Promise.all([
    listWiki(dir).catch(() => []),
    db.memoryNote.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return NextResponse.json({ dir, entries, notes });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const result = await updateMemory(body);
  await audit({
    actor,
    action: "api:POST /api/axis/memory",
    target: result.note.id,
    payload: body,
  });
  return NextResponse.json(result, { status: 201 });
});
