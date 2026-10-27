import { useEffect } from 'react';
import { FinaleChapter } from '../../components/home-v2/FinaleChapter';
import { HeroChapter } from '../../components/home-v2/HeroChapter';
import { JourneyChapter } from '../../components/home-v2/JourneyChapter';
import { LessonLabChapter } from '../../components/home-v2/LessonLabChapter';
import { ModesChapter } from '../../components/home-v2/ModesChapter';
import { RolesChapter } from '../../components/home-v2/RolesChapter';
import { SafetyChapter } from '../../components/home-v2/SafetyChapter';
import { SchoolsChapter } from '../../components/home-v2/SchoolsChapter';
import { SpatialChapter } from '../../components/home-v2/SpatialChapter';
import { V2Header } from '../../components/home-v2/V2Header';
import { V2SceneProvider } from '../../components/home-v2/V2Scene';
// The designed screen fallbacks use the Homepage's container-scaled type classes.
import '../../components/home/home.css';
import '../../components/home-v2/v2.css';

/**
 * Homepage V2 (H6.2), integration route `/home-v2`. Registered only in development builds, or in a
 * build that sets VITE_HOME_V2_PREVIEW=true for measurement. The public `/home` is unchanged.
 */
export default function HomeV2() {
  useEffect(() => {
    const previousTitle = document.title;
    const previousBg = document.body.style.background;
    document.title = 'VISTA: learn robotics with the SO-101';
    // The app's cream body would otherwise show on overscroll behind the dark page.
    document.body.style.background = '#08090a';
    return () => { document.title = previousTitle; document.body.style.background = previousBg; };
  }, []);

  return (
    <div id="top" className="vista-v2">
      <a href="#v2-main" className="sr-only z-50 rounded bg-[var(--v2-text)] px-4 py-3 text-[var(--v2-void)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <V2SceneProvider>
        <V2Header />
        <main id="v2-main" className="relative">
          <HeroChapter />
          <LessonLabChapter />
          <JourneyChapter />
          <SpatialChapter />
          <RolesChapter />
          <ModesChapter />
          <SafetyChapter />
          <SchoolsChapter />
          <FinaleChapter />
        </main>
      </V2SceneProvider>
    </div>
  );
}
