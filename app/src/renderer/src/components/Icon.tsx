// Duet's icons: one set of line icons (Lucide's shapes, MIT), drawn in the text colour at one stroke
// width, so every icon matches and none depends on a font's glyphs. Decorative by default: the
// button or text around an icon names it.
const PATHS = {
  home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
  today: <><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4m8-4v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/></>,
  words: <><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5Z"/><path d="M12 6v13.5"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>,
  video: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/></>,
  cards: <><rect x="6" y="6" width="15" height="15" rx="3"/><path d="M17 3H6a3 3 0 0 0-3 3v11M10 11h7m-7 5h4"/></>,
  flame: <path d="M12 2c1 6 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 1 4 2 4 2-2 2-6 1-10Z"/>,
  popout: <><path d="M14 3h7v7m0-7L11 13M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/></>,
  main: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M7 9h4m-4 4h4"/></>,
  star: (
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
  ),
  replay: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  // The Duet mark: the mascot at rest, two rounded shapes offset (components/Mascot.tsx), drawn
  // filled (with `filled`) as the mascot is. Not Lucide's.
  mascot: (
    <>
      <rect x="2.5" y="5.5" width="11" height="7" rx="3.5" />
      <rect x="10.5" y="11.5" width="11" height="7" rx="3.5" />
    </>
  ),
  // The new Duet mark (the app icon's face): squircle eyes with pill pupils cut out, and the offset
  // smile. Always solid, so it ignores the icon's stroke.
  duet: (
    <g stroke="none" fill="currentColor" fillRule="evenodd">
      <path d="M5.4 7h3a2.8 2.8 0 0 1 2.8 2.8v1.4a2.8 2.8 0 0 1-2.8 2.8h-3a2.8 2.8 0 0 1-2.8-2.8V9.8A2.8 2.8 0 0 1 5.4 7ZM5.5 11h1.3a.8.8 0 0 1 0 1.6H5.5a.8.8 0 0 1 0-1.6Z" />
      <path d="M15.6 7h3a2.8 2.8 0 0 1 2.8 2.8v1.4a2.8 2.8 0 0 1-2.8 2.8h-3a2.8 2.8 0 0 1-2.8-2.8V9.8A2.8 2.8 0 0 1 15.6 7ZM15.7 11h1.3a.8.8 0 0 1 0 1.6h-1.3a.8.8 0 0 1 0-1.6Z" />
      <path d="M9.6 16.1Q11.3 18.4 13.1 15.9Q11.3 16.8 9.6 16.1Z" />
    </g>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </>
  ),
  'mic-off': (
    <>
      <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1" />
      <path d="M19 10v2a7 7 0 0 1-.6 2.9M16.9 16.9A7 7 0 0 1 5 12v-2" />
      <path d="M12 19v3M3 3l18 18" />
    </>
  ),
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  volume: (
    <>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </>
  ),
  eye: (
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  )
} as const

export type IconName = keyof typeof PATHS

/** An icon at `size` px; `filled` fills its shape (a saved star). */
export function Icon({ name, size = 16, filled = false }: { name: IconName; size?: number; filled?: boolean }): React.JSX.Element {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
