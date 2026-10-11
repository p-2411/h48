// What a page shows while its data isn't there: Loading… the first time, and an error with Try
// again when loading failed (over what was shown before, if anything was: a failed reload keeps it).
export function LoadState({
  loaded,
  error,
  reload
}: {
  loaded: boolean
  error?: string
  reload: () => void
}): React.JSX.Element | null {
  if (error)
    return (
      <p className="notice error row" role="alert">
        <span>{loaded ? `${error} What’s shown may be out of date.` : error}</span>
        <button type="button" className="btn quiet" onClick={reload}>
          Try again
        </button>
      </p>
    )
  if (!loaded)
    return (
      <p className="faint" role="status">
        Loading…
      </p>
    )
  return null
}
