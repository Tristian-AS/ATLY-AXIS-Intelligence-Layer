// Smoke test for the AxisClient SDK against a live Axis backend.
// Run with: tsx scripts/smoke-client.ts
import { AxisClient } from "../client/src/index";

const axis = new AxisClient({
  baseUrl: "http://localhost:3018",
  token: "test-token-not-secret-just-for-smoke-test",
  actor: "bff:atlystudios",
});

async function main() {
  console.log("[health]", await axis.health());
  const { clients } = await axis.clients.list();
  console.log("[clients.list]", clients.map((c) => c.name));

  const { client } = await axis.clients.create({
    name: "Loftwood",
    industry: "Architecture",
    stage: "lead",
    brandNotes: "Restrained, material, slow.",
  });
  console.log("[clients.create]", client.name, client.id);

  const { project } = await axis.projects.create({
    clientName: "Loftwood",
    name: "Studio film",
    brief: "60s film + 3 verticals.",
  } as Parameters<typeof axis.projects.create>[0]);
  console.log("[projects.create]", project.name);

  const { invoice } = await axis.invoices.create({
    clientName: "Loftwood",
    amountDollars: 8500,
    notes: "Deposit",
  });
  console.log("[invoices.create]", invoice.number, invoice.amountCents);

  const status = await axis.status.get();
  console.log("[status]", JSON.stringify(status.status.counts));

  const dash = await axis.cinematicEngine.clientDashboard(client.id);
  console.log("[cinematicEngine.clientDashboard]", dash.client.name, "projects=", dash.projects.length, "campaigns=", dash.campaigns.length);

  console.log("\nAll SDK smoke tests passed.");
}

main().catch((e) => {
  console.error("[FAIL]", e);
  process.exit(1);
});
