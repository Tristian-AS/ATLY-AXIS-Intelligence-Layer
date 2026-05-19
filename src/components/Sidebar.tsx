import Link from "next/link";

const NAV = [
  { href: "/", label: "Status" },
  { href: "/chat", label: "Axis" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/content-calendar", label: "Content" },
  { href: "/finance", label: "Finance" },
  { href: "/memory", label: "Memory" },
  { href: "/integrations", label: "Integrations" },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-ink-700/60 bg-ink-950/70 backdrop-blur">
      <div className="px-6 py-7">
        <div className="font-display text-2xl tracking-[0.22em] text-signal">
          ATLY
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.4em] text-ink-400">
          axis
        </div>
      </div>

      <nav className="mt-2 flex flex-col px-3">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center justify-between rounded-md px-3 py-2 text-sm text-ink-200 transition hover:bg-ink-800/50 hover:text-signal"
          >
            <span className="tracking-wide">{item.label}</span>
            <span className="text-ink-500 transition group-hover:text-signal-accent">→</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-6 py-6 text-[10px] uppercase tracking-[0.3em] text-ink-500">
        v0.1 · phase 1
      </div>
    </aside>
  );
}
