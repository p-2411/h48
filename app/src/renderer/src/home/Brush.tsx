export function Brush({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="place-name">
      {children}
      <svg className="brush" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M1.2 3.9 C 6 2.6, 18 2.2, 34 2.5 C 52 2.8, 70 2.1, 86 2.4 C 93 2.5, 98.4 2.9, 99.3 3.8 C 99.8 4.6, 98.6 5.5, 95 5.7 C 80 6.2, 64 5.6, 46 6 C 30 6.3, 14 6, 5 5.8 C 2.2 5.7, 0.6 5, 1.2 3.9 Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}
