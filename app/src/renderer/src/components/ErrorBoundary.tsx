// Keeps one broken part from blanking a whole window: if what it wraps throws while rendering, it
// shows a short message and a way to try again in its place.
import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; /** What broke, in the learner's words ("This tab"). */ what?: string }

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('[duet] a view crashed', error)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
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
  }
}
