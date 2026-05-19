import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { db } from "@/lib/prisma";
import { listWiki, readWiki } from "@/lib/memory";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const params = await searchParams;
  const path = params.path ?? "_status.md";

  const [topLevel, notes, content] = await Promise.all([
    listWiki("").catch(() => []),
    db.memoryNote.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    readWiki(path).catch(() => `_File not found: ${path}_`),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Memory"
        title="The brain."
        description="The wiki is what Axis remembers. The raw tree is the evidence. Notes are the breadcrumbs."
        right={
          <Link
            href={`/chat?seed=${encodeURIComponent("Sync memory — recompute the status page.")}`}
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            Sync →
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside>
          <Card eyebrow="Wiki" title="Tree">
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  href="/memory?path=_status.md"
                  className={path === "_status.md" ? "text-signal-accent" : "text-ink-200 hover:text-signal"}
                >
                  _status.md
                </Link>
              </li>
              {topLevel
                .filter((e) => e !== "_status.md" && e !== "index.md")
                .map((entry) => (
                  <li key={entry} className="text-ink-300">
                    {entry.endsWith("/") ? entry : (
                      <Link
                        href={`/memory?path=${encodeURIComponent(entry)}`}
                        className={path === entry ? "text-signal-accent" : "hover:text-signal"}
                      >
                        {entry}
                      </Link>
                    )}
                  </li>
                ))}
              <li className="pt-2">
                <Link href="/memory?path=index.md" className="text-ink-200 hover:text-signal">
                  index.md
                </Link>
              </li>
              <li>
                <Link href="/memory?path=brand/index.md" className="text-ink-200 hover:text-signal">
                  brand/index.md
                </Link>
              </li>
            </ul>
          </Card>
        </aside>

        <div className="space-y-6">
          <Card eyebrow={path} title="">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-100">
              {content}
            </pre>
          </Card>

          <Card eyebrow="Notes" title="Recent memory entries">
            {notes.length === 0 ? (
              <p className="text-sm text-ink-400">Nothing stored yet.</p>
            ) : (
              <ul className="divide-y divide-ink-700/60">
                {notes.map((n) => (
                  <li key={n.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-signal">{n.title}</span>
                      <span className="text-[10px] uppercase tracking-widest text-ink-400">
                        {n.scope} · {shortDate(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-200">{n.body}</p>
                    {n.wikiPath ? (
                      <Link
                        href={`/memory?path=${encodeURIComponent(n.wikiPath)}`}
                        className="mt-1 inline-block text-[10px] uppercase tracking-widest text-signal-accent hover:underline"
                      >
                        {n.wikiPath} →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
