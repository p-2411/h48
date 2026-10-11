// Whether the person asked their system for reduced motion: animations that move things keep still.
export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
