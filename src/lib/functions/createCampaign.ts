import { db } from "@/lib/prisma";
import { writeWiki, slugify } from "@/lib/memory";

export interface CreateCampaignInput {
  clientId?: string;
  clientName?: string;
  projectId?: string;
  name: string;
  concept?: string;
  hooks?: string[];
  heroDirection?: string;
  goals?: string;
  startDate?: string;
  endDate?: string;
}

export async function createCampaign(input: CreateCampaignInput) {
  let clientId = input.clientId;
  if (!clientId && input.clientName) {
    const found = await db.client.findFirst({ where: { name: input.clientName } });
    if (found) clientId = found.id;
  }
  if (!clientId) throw new Error("createCampaign: clientId or known clientName required.");

  const campaign = await db.campaign.create({
    data: {
      clientId,
      projectId: input.projectId,
      name: input.name,
      concept: input.concept,
      hooks: input.hooks?.join("\n"),
      heroDirection: input.heroDirection,
      goals: input.goals,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
    include: { client: true },
  });

  const wikiPath = `campaigns/${slugify(campaign.client.name)}--${slugify(campaign.name)}.md`;
  await writeWiki(
    wikiPath,
    `# ${campaign.name}
_${campaign.client.name}_

## Concept
${campaign.concept ?? "_Pending._"}

## Hero direction
${campaign.heroDirection ?? "_Pending._"}

## Hooks
${input.hooks?.length ? input.hooks.map((h) => `- ${h}`).join("\n") : "- _Pending._"}

## Goals
${campaign.goals ?? "_Pending._"}
`
  );

  return { campaign, wikiPath };
}
