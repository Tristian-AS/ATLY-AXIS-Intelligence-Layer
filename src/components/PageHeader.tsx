interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, right }: PageHeaderProps) {
  return (
    <header className="mb-10 flex items-end justify-between gap-8 border-b atly-hairline pb-6">
      <div>
        {eyebrow ? (
          <div className="mb-3 text-[10px] uppercase tracking-[0.4em] text-signal-accent">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-4xl tracking-tight text-signal">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">{description}</p>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  );
}
