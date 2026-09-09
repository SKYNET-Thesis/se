/** Positive velocity opens; screen Y increases downward. */
export function gripperSlideVelocity(startY: number, currentY: number): number {
  const delta = startY - currentY;
  const distance = Math.abs(delta);
  if (distance <= 12) return 0;
  return Math.sign(delta) * Math.min(1, (distance - 12) / 120);
}
