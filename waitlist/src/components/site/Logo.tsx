/** The mark: an orange sun above three navy panels. Decorative; pair it with the name. */
export function LogoMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className={className}>
      <circle cx="15" cy="6" r="4" fill="#FF6A13" />
      <rect x="1" y="14" width="5.5" height="5.5" rx="1" fill="#1D2433" />
      <rect x="8.25" y="14" width="5.5" height="5.5" rx="1" fill="#1D2433" />
      <rect x="15.5" y="14" width="5.5" height="5.5" rx="1" fill="#1D2433" />
    </svg>
  );
}
