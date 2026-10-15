// Keeps one broken part from blanking a whole window: if what it wraps throws while rendering, it
// shows a short message and a way to try again in its place. `frame` places that message where the
// part was, when the page needs it placed (the strip's window is see-through and lets clicks through
// except over data-solid, so its message must sit where the strip was, marked solid).
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportViewCrash } from './reports'

type Props = {
  children: ReactNode
  /** What broke, in the learner's words ("This tab"). */
  what?: string
  /** Wraps the message, to place it where the part was. */
  frame?: (message: ReactNode) => ReactNode
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[duet] a view crashed', error)
    reportViewCrash(error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const message = (
      <div className="notice error row" role="alert">
        <span>{this.props.what ?? 'This window'} ran into a problem.</span>
        <button type="button" className="btn quiet" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
        <button type="button" className="btn quiet" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
    return this.props.frame ? this.props.frame(message) : message
  }
}
