// What the menu bar and Settings show about Duet's own updates (src/main/updates).

/** Where updates stand. */
export type UpdateState =
  /** This copy is not updated: run from source (dev), or installed in a way that can't update
   * itself (a Linux .deb or snap). */
  | { kind: 'off'; reason: 'dev' | 'unsupported' }
  /** Nothing to install: `checked` once a check has said so. */
  | { kind: 'idle'; checked: boolean }
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string; percent: number }
  /** Downloaded: installs when Duet quits, or at once with Restart to update. */
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; message: string }

/** This copy's version, and where its updates stand. */
export type UpdateStatus = { version: string; state: UpdateState }

/** The state in one sentence, for Settings. A download's progress is left out: it would be read
 * aloud at every percent (Settings shows it beside the sentence). */
export function updateLine(state: UpdateState): string {
  switch (state.kind) {
    case 'off':
      return state.reason === 'dev'
        ? 'Updates are off while Duet runs from source.'
        : 'This copy of Duet can’t update itself. Get new versions from useduet.io.'
    case 'idle':
      return state.checked ? 'Duet is up to date.' : 'Duet looks for updates on its own.'
    case 'checking':
      return 'Looking for updates…'
    case 'downloading':
      return `Downloading Duet ${state.version}…`
    case 'ready':
      return `Duet ${state.version} is ready. It installs when you quit Duet.`
    case 'failed':
      return state.message
  }
}

/** The menu bar's update item: what it says and whether it can be clicked (none when off). */
export function updateMenuItem(
  state: UpdateState
): { label: string; enabled: boolean } | undefined {
  switch (state.kind) {
    case 'off':
      return undefined
    case 'checking':
      return { label: 'Looking for updates…', enabled: false }
    case 'downloading':
      return { label: `Downloading Duet ${state.version}…`, enabled: false }
    case 'ready':
      return { label: `Restart to update to ${state.version}`, enabled: true }
    default:
      return { label: 'Check for updates', enabled: true }
  }
}
