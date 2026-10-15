import '../styles/base.css'
import '../styles/ui.css'
import '../explain/explain.css'
import '../review/review.css'
import './panel.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MotionRoot } from '../components/motion'
import { startReports } from '../components/reports'
import { Panel } from './Panel'

startReports()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      <ErrorBoundary what="The side panel">
        <Panel />
      </ErrorBoundary>
    </MotionRoot>
  </StrictMode>
)
