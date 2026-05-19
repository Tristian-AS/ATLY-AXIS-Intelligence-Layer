import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const RAW_ROOT = path.resolve(ROOT, process.env.AXIS_MEMORY_RAW ?? "raw");

const KIND_TO_BUCKET: Record<string, string> = {
  screenshot: "client-assets",
  reference: "client-assets",
  proposal: "proposals",
  invoice: "invoices",
  expense: "expenses",
  receipt: "receipts",
  analytics: "analytics",
  "shoot-note": "shoot-notes",
  note: "misc",
  contract: "misc",
};

export const GET = protect(async (req: NextRequest) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const files = await db.fileRecord.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ files });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  const kind = (form.get("kind") as string | null) ?? "note";
  const label = (form.get("label") as string | null) ?? undefined;
  const clientId = (form.get("clientId") as string | null) ?? undefined;
  const projectId = (form.get("projectId") as string | null) ?? undefined;

  const bucket = KIND_TO_BUCKET[kind] ?? "misc";
  const now = new Date();
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(RAW_ROOT, bucket, yyyymm);
  await fs.mkdir(dir, { recursive: true });

  const safeName = `${Date.now()}-${slugify(file.name) || "upload"}`;
  const ext = path.extname(file.name);
  const finalName = safeName.endsWith(ext) ? safeName : `${safeName}${ext}`;
  const fullPath = path.join(dir, finalName);
  const relPath = path.relative(ROOT, fullPath);

  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, bytes);

  const record = await db.fileRecord.create({
    data: {
      clientId,
      projectId,
      path: relPath,
      kind,
      label,
      bytes: bytes.byteLength,
    },
  });

  await audit({
    actor,
    action: "api:POST /api/axis/files",
    target: record.id,
    payload: { kind, bucket, bytes: bytes.byteLength, filename: file.name },
  });

  return NextResponse.json({ file: record, path: relPath }, { status: 201 });
});
