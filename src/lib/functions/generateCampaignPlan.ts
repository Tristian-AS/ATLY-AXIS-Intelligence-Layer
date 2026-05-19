import { anthropic, AXIS_MODEL } from "@/lib/anthropic";
import { db } from "@/lib/prisma";
import { createCampaign } from "./createCampaign";

export interface GenerateCampaignPlanInput {
  clientName: string;
  brief: string;
  goal?: string;
  persist?: boolean; // if true, write the resulting plan into the campaigns table + wiki
}

interface CampaignPlan {
  name: string;
  concept: string;
  heroDirection: string;
  hooks: string[];
  goals: string;
  rationale: string;
}

/**
 * Generates a structured campaign plan via Claude, returning JSON.
 * Optionally persists it as a campaign row + wiki page.
 */
export async function generateCampaignPlan(
  input: GenerateCampaignPlanInput
): Promise<{ plan: CampaignPlan; campaignId?: string; wikiPath?: string }> {
  const client = await db.client.findFirst({ where: { name: input.clientName } });
  const brandNotes = client?.brandNotes ?? "(no brand notes on file)";

  const system = `You are ATLY's Creative Director agent. Produce a single cinematic campaign plan.
Voice: editorial, restrained, sensorial. No emojis. No marketing-speak.
Return ONLY valid JSON matching this TypeScript type:
{
  "name": string,
  "concept": string,        // 2-3 sentences. The big idea.
  "heroDirection": string,  // visual direction for the hero asset
  "hooks": string[],        // 5 short hook lines, viewer-first
  "goals": string,          // what success looks like, measurable
  "rationale": string       // why this works for THIS client
}`;

  const user = `Client: ${input.clientName}
Brand notes:
${brandNotes}

Brief:
${input.brief}

${input.goal ? `Stated goal: ${input.goal}` : ""}`;

  const resp = await anthropic.messages.create({
    model: AXIS_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("generateCampaignPlan: model did not return JSON.");
  }
  const plan = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as CampaignPlan;

  if (input.persist && client) {
    const { campaign, wikiPath } = await createCampaign({
      clientId: client.id,
      name: plan.name,
      concept: plan.concept,
      heroDirection: plan.heroDirection,
      hooks: plan.hooks,
      goals: plan.goals,
    });
    return { plan, campaignId: campaign.id, wikiPath };
  }

  return { plan };
}
