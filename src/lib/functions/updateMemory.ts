import { db } from "@/lib/prisma";
import { appendWiki, writeWiki, slugify } from "@/lib/memory";

export interface UpdateMemoryInput {
  scope?: "client" | "project" | "campaign" | "finance" | "lesson" | "brand" | "general";
  clientName?: string;
  title: string;
  body: string;
  tags?: string[];
  source?: "chat" | "file" | "manual";
  wikiPath?: string;       // explicit override
  mode?: "append" | "replace";
}

function defaultWikiPath(scope: string, title: string, clientName?: string): string {
  const base = scope === "lesson" ? "lessons" : scope === "brand" ? "brand" : scope === "finance" ? "finance" : "journal";
  const prefix = clientName ? `${slugify(clientName)}--` : "";
  if (base === "journal") {
    const d = new Date().toISOString().slice(0, 10);
    return `journal/${d}.md`;
  }
  return `${base}/${prefix}${slugify(title)}.md`;
}

export async function updateMemory(input: UpdateMemoryInput) {
  const scope = input.scope ?? "general";
  const wikiPath = input.wikiPath ?? defaultWikiPath(scope, input.title, input.clientName);

  let clientId: string | undefined;
  if (input.clientName) {
    const c = await db.client.findFirst({ where: { name: input.clientName } });
    if (c) clientId = c.id;
  }

  const heading = `## ${input.title}\n\n${input.body}\n${input.tags?.length ? `\n_tags: ${input.tags.join(", ")}_\n` : ""}`;

  if (input.mode === "replace") {
    await writeWiki(wikiPath, `# ${input.title}\n\n${input.body}\n`);
  } else {
    await appendWiki(wikiPath, heading);
  }

  const note = await db.memoryNote.create({
    data: {
      scope,
      clientId,
      title: input.title,
      body: input.body,
      source: input.source ?? "chat",
      wikiPath,
      tags: input.tags?.join(","),
    },
  });

  return { note, wikiPath };
}
