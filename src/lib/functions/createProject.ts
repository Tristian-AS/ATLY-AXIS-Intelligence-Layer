import { db } from "@/lib/prisma";
import { writeWiki, slugify } from "@/lib/memory";
import { dollarsToCents } from "@/lib/format";

export interface CreateProjectInput {
  clientId?: string;
  clientName?: string; // fallback — look up or create by name
  name: string;
  status?: "active" | "paused" | "done" | "stalled";
  brief?: string;
  deliverables?: string[];
  budgetDollars?: number;
  startDate?: string;
  dueDate?: string;
  nextAction?: string;
}

export async function createProject(input: CreateProjectInput) {
  let clientId = input.clientId;
  if (!clientId && input.clientName) {
    const found = await db.client.findFirst({ where: { name: input.clientName } });
    if (found) clientId = found.id;
  }
  if (!clientId) {
    throw new Error("createProject: clientId or known clientName required.");
  }

  const project = await db.project.create({
    data: {
      clientId,
      name: input.name,
      status: input.status ?? "active",
      brief: input.brief,
      deliverables: input.deliverables ? JSON.stringify(input.deliverables) : null,
      budgetCents: dollarsToCents(input.budgetDollars ?? null),
      startDate: input.startDate ? new Date(input.startDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      nextAction: input.nextAction,
    },
    include: { client: true },
  });

  const wikiPath = `projects/${slugify(project.client.name)}--${slugify(project.name)}.md`;
  const body = `# ${project.name}
_${project.client.name}_

**Status.** ${project.status}
${project.dueDate ? `**Due.** ${project.dueDate.toISOString().slice(0, 10)}` : ""}
${project.budgetCents ? `**Budget.** $${(project.budgetCents / 100).toLocaleString()}` : ""}

## Brief
${project.brief ?? "_Pending._"}

## Deliverables
${
  input.deliverables?.length
    ? input.deliverables.map((d) => `- ${d}`).join("\n")
    : "- _Pending._"
}

## Next action
${project.nextAction ?? "_Pending._"}

## Risks
_None logged yet._
`;
  await writeWiki(wikiPath, body);

  return { project, wikiPath };
}
