import { db } from "@/lib/prisma";
import { writeWiki, slugify } from "@/lib/memory";
import { dollarsToCents } from "@/lib/format";

export interface CreateClientInput {
  name: string;
  handle?: string;
  website?: string;
  industry?: string;
  stage?: "lead" | "active" | "paused" | "churned";
  brandNotes?: string;
  nextAction?: string;
  retainerDollars?: number;
}

export async function createClient(input: CreateClientInput) {
  const client = await db.client.create({
    data: {
      name: input.name,
      handle: input.handle,
      website: input.website,
      industry: input.industry,
      stage: input.stage ?? "lead",
      brandNotes: input.brandNotes,
      nextAction: input.nextAction,
      retainerCents: dollarsToCents(input.retainerDollars ?? null),
    },
  });

  const wikiPath = `clients/${slugify(client.name)}.md`;
  const body = `# ${client.name}

${client.handle ? `**Handle.** ${client.handle}` : ""}
${client.website ? `**Web.** ${client.website}` : ""}
${client.industry ? `**Industry.** ${client.industry}` : ""}
**Stage.** ${client.stage}

## Brand notes
${client.brandNotes ?? "_Pending._"}

## Next action
${client.nextAction ?? "_Pending._"}

## History
- ${new Date().toISOString().slice(0, 10)} — added to Axis.
`;
  await writeWiki(wikiPath, body);

  return { client, wikiPath };
}
