// Settings → Sources: the open data Duet is built on (src/shared/sources.ts), each with who made it,
// what Duet uses it for and its licence. A screen of its own, as JMdict's licence asks of an app.
import { SOURCES } from '../../../shared/sources'

export function SourcesPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <main className="home-page home-settings">
      <div>
        <button type="button" className="btn" onClick={onBack}>
          ← Settings
        </button>
      </div>
      <h1>Sources</h1>
      <p className="set-lede serif">
        Duet’s dictionaries and word lists come from open data. Thank you to everyone who made it.
      </p>
      {SOURCES.map((source) => (
        <section
          key={source.name}
          className="settings-group"
          aria-labelledby={`source-${source.name}`}
        >
          <h2 className="label" id={`source-${source.name}`}>
            {source.name}
          </h2>
          <div className="glass">
            <p>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
              </a>{' '}
              by {source.by}.
            </p>
            <p className="muted">Used for: {source.use}.</p>
            <p className="muted">
              Licence:{' '}
              <a href={source.licenceUrl} target="_blank" rel="noreferrer">
                {source.licence}
              </a>
              .{source.changed && ` ${source.changed}`}
            </p>
            {source.notice && (
              <details>
                <summary className="muted">Licence text</summary>
                <pre className="sources-notice">{source.notice}</pre>
              </details>
            )}
          </div>
        </section>
      ))}
    </main>
  )
}
