import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  buildRobotSummary,
  getRobotLink,
  getRobotSetup,
  getSuggestedSkill,
  RobotLink,
  RobotSetup,
  RobotSummary,
  subscribeRobotLink
} from "../data/robot";
import { Task } from "../data/tasks";

// The live shared robot summary — the one readiness source for every
// screen (Home, Skill Detail, Robot hub, Manual Control, Phone Control).
// Re-renders synchronously when the robot link changes (useSyncExternalStore)
// or E-STOP flips. null only until the suggested skill first loads, so a
// screen never flashes a readiness without its next action.
export function useRobotSummary({ emergencyStopped }: { emergencyStopped: boolean }): RobotSummary | null {
  const link = useSyncExternalStore(subscribeRobotLink, getRobotLink, getRobotLink);
  const [suggestedSkill, setSuggestedSkill] = useState<Task | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    getSuggestedSkill().then((task) => {
      if (mounted) setSuggestedSkill(task);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return useMemo(
    () => (suggestedSkill === undefined ? null : buildRobotSummary(link, emergencyStopped, suggestedSkill)),
    [emergencyStopped, link, suggestedSkill]
  );
}

// The raw shared link (connected / calibrated / connecting), for screens
// that manage the connection itself. Readiness still comes from
// useRobotSummary — never re-derive it from these flags.
export function useRobotLink(): RobotLink {
  return useSyncExternalStore(subscribeRobotLink, getRobotLink, getRobotLink);
}

// The full multi-arm state (every arm + the active setup), for the screens
// that work per arm — Calibration today, Connect later. Everything else
// reads the aggregate through useRobotSummary / useRobotLink.
export function useRobotSetup(): RobotSetup {
  return useSyncExternalStore(subscribeRobotLink, getRobotSetup, getRobotSetup);
}
