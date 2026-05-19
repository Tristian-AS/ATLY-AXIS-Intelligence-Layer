import { db } from "@/lib/prisma";
import type { AxisActor } from "@/lib/auth";

interface AuditInput {
  actor: AxisActor;
  action: string;
  target?: string;
  payload?: unknown;
  status?: "ok" | "error";
  message?: string;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        target: input.target,
        payload: input.payload ? JSON.stringify(input.payload).slice(0, 20_000) : undefined,
        status: input.status ?? "ok",
        message: input.message,
      },
    });
  } catch (err) {
    // Audit failures must never break the request path.
    console.warn("[audit] failed to record:", (err as Error).message);
  }
}
