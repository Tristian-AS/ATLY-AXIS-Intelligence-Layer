import { anthropic, AXIS_MODEL } from "@/lib/anthropic";
import { db } from "@/lib/prisma";

export interface GenerateContentCalendarInput {
  clientName: string;
  campaignId?: string;
  weeks?: number; // default 2
  platforms?: string[]; // default: instagram, tiktok
  persist?: boolean;
}

interface PlannedPost {
  platform: string;
  hook: string;
  caption: string;
  scheduledFor: string; // ISO
}

export async function generateContentCalendar(input: GenerateContentCalendarInput) {
  const client = await db.client.findFirst({ where: { name: input.clientName } });
  if (!client) throw new Error(`generateContentCalendar: unknown client ${input.clientName}`);

  const campaign = input.campaignId
    ? await db.campaign.findUnique({ where: { id: input.campaignId } })
    : null;

  const weeks = input.weeks ?? 2;
  const platforms = input.platforms ?? ["instagram", "tiktok"];

  const system = `You are ATLY's Content Systems agent. Generate a content calendar.
Voice: editorial, restrained, sensorial. No emojis.
Return ONLY a JSON array of post objects with this shape:
{ "platform": "instagram"|"tiktok"|"youtube"|"x"|"linkedin"|"email", "hook": string, "caption": string, "scheduledFor": ISO-8601 date string }
Cadence: ~3 posts per platform per week, varied formats.`;

  const user = `Client: ${client.name}
Brand notes:
${client.brandNotes ?? "(none)"}
${
  campaign
    ? `Active campaign: ${campaign.name}\nConcept: ${campaign.concept}\nHooks: ${campaign.hooks}`
    : ""
}

Generate ${weeks} weeks of posts across these platforms: ${platforms.join(", ")}.
Schedule starting tomorrow. Spread evenly. Today's date is ${new Date().toISOString().slice(0, 10)}.`;

  const resp = await anthropic.messages.create({
    model: AXIS_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart < 0 || arrEnd < 0) {
    throw new Error("generateContentCalendar: model did not return a JSON array.");
  }
  const posts = JSON.parse(text.slice(arrStart, arrEnd + 1)) as PlannedPost[];

  let written = 0;
  if (input.persist) {
    for (const p of posts) {
      await db.contentCalendarPost.create({
        data: {
          clientId: client.id,
          campaignId: campaign?.id,
          platform: p.platform,
          hook: p.hook,
          caption: p.caption,
          scheduledFor: p.scheduledFor ? new Date(p.scheduledFor) : null,
          status: "draft",
        },
      });
      written++;
    }
  }

  return { posts, written };
}
