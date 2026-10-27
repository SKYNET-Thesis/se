import { useEffect, useRef } from 'react';

/** Adds `is-in` to a `.vh-reveal` container once it enters the viewport (immediately if IntersectionObserver is missing). */
export function useReveal<T extends HTMLElement>(threshold = 0.05) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!('IntersectionObserver' in window)) { node.classList.add('is-in'); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      node.classList.add('is-in');
      observer.disconnect();
    }, { threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return ref;
}
