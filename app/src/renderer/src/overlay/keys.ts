// Duet's global keys (show or hide, talk): turning a key press into an Electron accelerator ("Alt+Shift+D"), and an
// accelerator into the symbols a Mac shows (⌥⇧D), or the words Windows shows (Alt+Shift+D).

// Off the Mac, the ⊞ Windows key (metaKey) is kept for Windows' own shortcuts, so it can't be one of Duet's.
const MAC = (globalThis as { duet?: { platform?: string } }).duet?.platform !== 'win32'

const MODIFIERS: [keyof KeyboardEvent, string][] = [
  ['metaKey', 'Command'],
  ['ctrlKey', 'Control'],
  ['altKey', 'Alt'],
  ['shiftKey', 'Shift']
]

const SYMBOLS: Record<string, string> = { Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Up: '↑', Down: '↓', Left: '←', Right: '→' }

// Keys by their place on the keyboard (event.code), so ⌥ doesn't turn D into ∂.
function keyName(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  if (code.startsWith('Arrow')) return code.slice(5)
  const named: Record<string, string> = {
    Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Minus: '-', Equal: '=', Comma: ',', Period: '.',
    Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`'
  }
  return named[code]
}

/**
 * The accelerator for a key press: undefined while only modifiers are down. Needs ⌘, ⌃ or ⌥, so
 * the keys can't be ones typed in other apps.
 */
export function accelerator(event: KeyboardEvent): string | undefined {
  const key = keyName(event.code)
  if (!key) return undefined
  if (!MAC && event.metaKey) return undefined
  const modifiers = MODIFIERS.filter(([flag]) => event[flag]).map(([, name]) => name)
  if (!modifiers.some((name) => name !== 'Shift')) return undefined
  return [...modifiers, key].join('+')
}

/** "Alt+Shift+D" → "⌥⇧D" on the Mac; on Windows, "Ctrl+Alt+D" as Windows writes it. */
export function symbols(accelerator: string): string {
  if (!MAC) return accelerator.replace(/\bControl\b/g, 'Ctrl').replace(/\bReturn\b/g, 'Enter')
  return accelerator
    .split('+')
    .map((part) => SYMBOLS[part] ?? part)
    .join('')
}
