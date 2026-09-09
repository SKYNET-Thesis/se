import { useEffect, useRef } from "react";

/** Sensor renders must not restart the transport clock (ARKit runs faster than 20 Hz). */
export function usePoseSender(active: boolean, send: () => void) {
  const latest = useRef(send);
  latest.current = send;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => latest.current(), 50);
    return () => clearInterval(timer);
  }, [active]);
}
