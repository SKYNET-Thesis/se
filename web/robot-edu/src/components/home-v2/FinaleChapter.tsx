import { Link } from 'react-router-dom';
import { useHomeCta } from '../home/HomeCta';
import { approvedCredits } from '../home/media/homeAssets';
import { useReveal } from '../home/useReveal';
import { CREDITS, NAV } from './content';
import { SO101_3D_ALLOWED } from './V2Scene';

/**
 * S9 — the closing frame: the live arm seen from behind in rim light (not the hero again), the final
 * action, then the footer with every chapter, the required attribution, and the preview/physical line.
 * The VISTA wordmark rises letter by letter once, at the very end.
 */
export function FinaleChapter() {
  const cta = useHomeCta();
  const wordmark = useReveal<HTMLDivElement>(0.2);
  const credits = approvedCredits();
  return (
    <>
      <section id="v2-final" data-scene="finale" aria-labelledby="v2-final-title" className="v2-anchor relative z-10 flex min-h-[100svh] flex-col justify-end px-[var(--v2-margin)] pb-[clamp(40px,8svh,96px)] pt-[calc(var(--v2-header)+40px)] lg:justify-center lg:pb-[clamp(40px,6svh,72px)]">
        {/* Where the arm parks: above the closing line on phones, to its right on wide screens. */}
        <div data-stage-window="bleed" aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[54%] [--stage-ay:0.66] lg:inset-y-0 lg:left-[46%] lg:right-0 lg:h-auto lg:[--stage-ay:0.5]" />
        <h2 id="v2-final-title" className="v2-display text-[length:var(--v2-statement)] font-medium">
          <span className="block">Start with</span>{' '}<span className="block">lesson one</span>
        </h2>
        {/* One block: the closing line, the sentence it rests on, and the two actions directly under it (H6.9 CP3). */}
        <div className="mt-7 flex max-w-[44ch] flex-col gap-6 lg:max-w-[min(46%,560px)]">
          <p className="max-w-[42ch] text-[18px] leading-[1.55] text-[var(--v2-soft)]">If your class has been assigned Open &amp; Close Gripper, you will find it in My Learning after you sign in.</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link to={cta.to} className="inline-flex h-12 items-center rounded-[4px] bg-[var(--v2-teal)] px-6 text-[15px] font-semibold text-[var(--v2-void)] transition-[background-color,transform] duration-150 hover:bg-[var(--v2-text)] active:scale-[0.98]">{cta.label}</Link>
            <a href="#v2-lesson" className="inline-flex h-12 items-center text-[15px] font-semibold underline decoration-[var(--v2-line-strong)] decoration-2 underline-offset-[7px] hover:decoration-[var(--v2-teal)]">Play lesson one again</a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 overflow-hidden bg-[var(--v2-void)] px-[var(--v2-margin)] pt-20">
        <div className="grid gap-12 md:grid-cols-12">
          <nav aria-label="Footer" className="md:col-span-4">
            <h2 className="text-[14px] font-semibold text-[var(--v2-muted)]">On this page</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6">
              {NAV.map((n) => <li key={n.id}><a href={`#${n.id}`} className="inline-flex min-h-11 items-center text-[16px] transition-colors hover:text-[var(--v2-teal)]">{n.label}</a></li>)}
              <li><a href="#top" className="inline-flex min-h-11 items-center text-[16px] transition-colors hover:text-[var(--v2-teal)]">Back to top</a></li>
            </ul>
          </nav>
          <div className="md:col-span-5 md:col-start-6">
            <h2 className="text-[14px] font-semibold text-[var(--v2-muted)]">Credits and attribution</h2>
            <ul className="mt-3 grid gap-2 text-[14px] leading-[1.55] text-[var(--v2-soft)]">
              {CREDITS.map((c) => <li key={c}>{c}</li>)}
              {credits.map((c) => <li key={c.id}>{c.href ? <a href={c.href} className="underline underline-offset-2">{c.text}</a> : c.text}{c.licence ? ` ${c.licence}` : ''}</li>)}
            </ul>
          </div>
          <div className="md:col-span-3 md:col-start-10">
            <p className="text-[14px] leading-[1.55] text-[var(--v2-soft)]">Every robot view on this page is a 3D preview. Physical robot execution is locked in this release.</p>
            {SO101_3D_ALLOWED && import.meta.env.DEV && <p className="mt-3 text-[13px] text-[var(--v2-muted)]">Development build of Homepage V2.</p>}
            <p className="mt-3 text-[13px] text-[var(--v2-muted)]">© 2026 VISTA</p>
          </div>
        </div>
        <div ref={wordmark} aria-hidden className="mt-20 flex select-none justify-between overflow-hidden">
          {'VISTA'.split('').map((letter, i) => (
            <span key={letter} className="block overflow-hidden">
              <span className="v2-display v2-wordmark-letter block text-[clamp(96px,min(27vw,44svh),500px)] font-extrabold leading-[0.78] text-[var(--v2-graphite-3)]" style={{ ['--d' as string]: i * 80 }}>{letter}</span>
            </span>
          ))}
        </div>
      </footer>
    </>
  );
}
