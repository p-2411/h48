import '../styles/base.css'
import './overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MotionRoot } from '../components/motion'
import { Overlay } from './Overlay'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      {/* A crash shows its message where the strip was, so its buttons can be pressed. */}
      <ErrorBoundary
        what="The strip"
        frame={(message) => (
          <div className="stage">
            <div className="strip crashed" data-solid>
              {message}
            </div>
          </div>
        )}
      >
        <Overlay />
      </ErrorBoundary>
    </MotionRoot>
  </StrictMode>
)
