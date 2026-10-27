import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../utils/cn';
import { DeferredMedia } from './DeferredMedia';
import { useReveal } from '../home/useReveal';
import { ROLES, type Role } from './content';

/**
 * The role's screen in the page's one stage language (H6.9, shared with the learning loop): a graphite
 * bezel with the screen inset evenly, and a caption band under it carrying the role's mark. The role
 * colour is a mark, not a field.
 */
function Bezel({ role, children, className, markOnly }: { role: Role; children: ReactNode; className?: string; markOnly?: boolean }) {
  return (
    <div aria-hidden className={cn('grid grid-rows-[minmax(0,1fr)_auto] gap-[clamp(10px,1.1vw,16px)] rounded-[6px] bg-[var(--v2-graphite-2)] p-[clamp(10px,1.1vw,16px)]', className)}>
      <div className="relative min-h-0 overflow-hidden rounded-[3px] bg-[var(--v2-graphite-3)]">{children}</div>
      <p className="flex items-center gap-4 px-1 text-[14px]">
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--v2-text)]"><span className="h-2.5 w-6 rounded-full" style={{ backgroundColor: role.accent }} />{!markOnly && role.name}</span>
      </p>
    </div>
  );
}

/** One role's screen inside the bezel. */
function Screen({ role, style, className, off }: { role: Role; style?: CSSProperties; className?: string; off?: boolean }) {
  return (
    <div data-off={off ? '' : undefined} className={cn('absolute inset-0 overflow-hidden', className)} style={style}>
      <DeferredMedia id={role.asset} minWidth={520} />
    </div>
  );
}

function RoleText({ role }: { role: Role }) {
  return (
    <>
      <h3 id={`v2-role-${role.id}`} className="v2-display text-[length:var(--v2-head)] font-medium">{role.name}</h3>
      <p className="mt-4 max-w-[30ch] text-[length:var(--v2-lead)] leading-[1.45]">{role.lead}</p>
      <ul className="mt-5 grid gap-3">
        {role.points.map((point) => (
          <li key={point} className="grid grid-cols-[10px_1fr] gap-4 text-[16px] leading-[1.55] text-[var(--v2-soft)]">
            <span aria-hidden className="mt-[0.55em] h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: role.accent }} />
            <span><span className="sr-only">{role.name}: </span>{point}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * S5 — one product, three chapters. On wide screens a pinned stage holds a plate that takes each role's
 * accent while its screen is revealed side to side, and the three roles scroll past beside it as
 * editorial chapters (the page's one pinned story; native scroll, nothing hijacked). On narrower screens
 * every role carries its own plate. Screens are illustrative fallbacks until approved screenshots exist.
 */
export function RolesChapter() {
  const reveal = useReveal<HTMLDivElement>(0.3);
  const wide = useMediaQuery('(min-width: 1024px)');
  const articles = useRef<Array<HTMLElement | null>>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!wide) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.index));
    }, { rootMargin: '-45% 0px -45% 0px' });
    articles.current.forEach((a) => a && io.observe(a));
    return () => io.disconnect();
  }, [wide]);

  const role = ROLES[current];

  return (
    <section id="v2-roles" aria-labelledby="v2-roles-title" className="v2-anchor v2-anchor-tight relative z-10 bg-[var(--v2-void)] px-[var(--v2-margin)] pt-[var(--v2-section)] pb-[var(--v2-section)] lg:pb-[clamp(24px,4svh,48px)]">
      <div ref={reveal} className="v2-reveal grid gap-6 lg:grid-cols-12 lg:items-end">
        <h2 id="v2-roles-title" data-reveal className="v2-display text-[length:var(--v2-head)] font-medium lg:col-span-6">For the whole classroom</h2>
        <p data-reveal style={{ ['--d' as string]: 80 }} className="max-w-[44ch] text-[17px] leading-[1.55] text-[var(--v2-soft)] lg:col-span-5 lg:col-start-8">Everyone signs in with the account their school provides, and each role sees only the part of VISTA it needs.</p>
      </div>

      <div className="mt-16 lg:mt-8 lg:grid lg:grid-cols-12 lg:gap-10">
        {wide && (
          <div className="lg:col-span-7">
            {/* The plate fits the pinned stage both ways: as wide as the column, never taller than the screen. */}
            <div className="sticky top-[var(--v2-header)] h-[calc(100svh-var(--v2-header))] [container-type:size]">
              <Bezel role={role} className="absolute left-0 top-1/2 aspect-[16/11] w-[min(100cqw,calc((100cqh-48px)*1.4545))] -translate-y-1/2">
                {ROLES.map((r, i) => (
                  <Screen key={r.id} role={r} className="v2-role-screen" off={i !== current}
                    style={{ clipPath: i === current ? 'inset(0 0 0 0)' : i > current ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)', transform: i === current ? 'none' : 'scale(1.035)', zIndex: i === current ? 2 : 1 }} />
                ))}
              </Bezel>
            </div>
          </div>
        )}
        <div className="grid gap-[clamp(72px,10vw,120px)] lg:col-span-4 lg:col-start-9 lg:gap-0">
          {ROLES.map((r, i) => (
            <article key={r.id} ref={(el) => { articles.current[i] = el; }} data-index={i} aria-labelledby={`v2-role-${r.id}`}
              className={cn('lg:flex lg:min-h-[72svh] lg:flex-col lg:justify-center lg:last:min-h-[52svh] lg:transition-opacity lg:duration-500', wide && i !== current && 'lg:opacity-[0.68]')}>
              {/* The role's name is its heading right below, so the caption carries only its mark here. */}
              {!wide && <Bezel role={r} markOnly className="mb-6 aspect-[8/7]"><Screen role={r} /></Bezel>}
              <RoleText role={r} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
