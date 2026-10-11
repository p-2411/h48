import '../styles/base.css'
import '../styles/ui.css'
import '../cards/cards.css'
import '../review/review.css'
import '../explain/explain.css'
import './home.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MotionRoot } from '../components/motion'
import { Home } from './Home'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      <ErrorBoundary what="Duet">
        <Home />
      </ErrorBoundary>
    </MotionRoot>
  </StrictMode>
)
