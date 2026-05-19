/**
 * Minimal seed. Gives Axis something to talk about on first boot.
 * Run with: `npm run db:seed`
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.client.count();
  if (existing > 0) {
    console.log("[seed] clients already exist — skipping.");
    return;
  }

  const rhome = await db.client.create({
    data: {
      name: "Rhøme",
      handle: "@rhome",
      industry: "DTC home goods",
      stage: "active",
      brandNotes:
        "Editorial, tactile, slow-luxury. Avoid generic ecom cliches. Voice: confident, restrained, sensorial.",
      nextAction: "Lock Q3 campaign concept",
      retainerCents: 850000,
    },
  });

  await db.project.create({
    data: {
      clientId: rhome.id,
      name: "Rhøme — Cinematic Brand Film",
      status: "active",
      brief: "60s hero film + 6 vertical cutdowns. Shot on location.",
      deliverables: JSON.stringify([
        "60s hero",
        "3x 15s verticals",
        "3x 9s hooks",
        "BTS reel",
      ]),
      budgetCents: 2200000,
      nextAction: "Confirm shoot dates",
    },
  });

  await db.task.create({
    data: {
      clientId: rhome.id,
      title: "Send Rhøme the updated shoot calendar",
      priority: "high",
      status: "open",
    },
  });

  await db.memoryNote.create({
    data: {
      scope: "lesson",
      title: "Approval cycles compress production windows",
      body:
        "When a client takes >5 business days to approve a script, the shoot window collapses. " +
        "Build a hard gate: no shoot date locked until script is signed off.",
      tags: "production,lessons,approvals",
    },
  });

  console.log("[seed] seeded Rhøme + initial state.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
