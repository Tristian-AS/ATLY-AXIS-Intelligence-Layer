import { clsx } from "clsx";

interface CardProps {
  title?: string;
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Card({ title, eyebrow, className, children, action }: CardProps) {
  return (
    <section
      className={clsx(
        "rounded-lg border border-ink-700/60 bg-ink-900/40 p-6 shadow-film",
        className
      )}
    >
      {(title || eyebrow || action) && (
        <header className="mb-4 flex items-center justify-between">
          <div>
            {eyebrow ? (
              <div className="text-[10px] uppercase tracking-[0.35em] text-signal-accent">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="mt-1 font-display text-lg tracking-tight text-signal">{title}</h2>
            ) : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-5">
      <div className="text-[10px] uppercase tracking-[0.3em] text-ink-400">{label}</div>
      <div className="mt-2 font-display text-3xl tracking-tight text-signal">{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-300">{hint}</div> : null}
    </div>
  );
}
