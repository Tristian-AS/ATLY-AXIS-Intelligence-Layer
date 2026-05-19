import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const recent = await db.chatMessage.findMany({
    where: { threadId: "main" },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Axis"
        title="Talk to the studio."
        description="Chat is the interface. Tell Axis what you know — it decides what becomes memory, what becomes a project, what becomes money."
      />
      <Suspense>
        <ChatPanel initialMessages={recent} />
      </Suspense>
    </div>
  );
}
