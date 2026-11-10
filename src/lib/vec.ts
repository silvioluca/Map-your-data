/** Direzione di un vettore in gradi, da +x in senso antiorario, in [0, 360). */
export function angle360(vx: number, vy: number): number {
  if (vx === 0 && vy === 0) return NaN
  const a = (Math.atan2(vy, vx) * 180) / Math.PI
  const r = a < 0 ? a + 360 : a
  // -0.00001 arrotondato darebbe 360.0
  return r >= 359.99995 ? 0 : r
}
