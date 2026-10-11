import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createRobotPoseControlSession,
  PhoneControlEvent,
  PhoneControlSession,
  PoseSessionState
} from "../data/robotPoseControl";

type Handlers = Partial<Record<PhoneControlEvent, () => void>>;

// Phone Control's controller session, from the domain. The domain picks the
// logical arm (the active setup's controlled follower) when the screen
// mounts and keeps the session on it; the screen never sees arm ids,
// bindings or the transport. It gets the session's state (disconnected /
// connecting / connected), whether a session is possible at all, and
// lifecycle events. The session is shut down on unmount (no events after
// that). Handlers always see the screen's latest render.
export function usePhoneControlSession(
  platform: "android" | "ios",
  handlers: Handlers
): { session: PhoneControlSession; state: PoseSessionState; available: boolean } {
  const [session] = useState(() => createRobotPoseControlSession({ platform }));
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => session.onEvent((event) => handlersRef.current[event]?.()), [session]);
  useEffect(() => () => session.shutdown(), [session]);

  return { session, state, available: session.available };
}
