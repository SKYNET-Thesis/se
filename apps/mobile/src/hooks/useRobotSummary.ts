import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { buildRobotSummary, getRobotLink, getSuggestedSkill, RobotSummary, subscribeRobotLink } from "../data/robot";
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
