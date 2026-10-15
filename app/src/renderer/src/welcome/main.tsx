import '../styles/base.css'
import '../styles/ui.css'
import './welcome.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MotionRoot } from '../components/motion'
import { startReports } from '../components/reports'
import { Welcome } from './Welcome'

startReports()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionRoot>
      <ErrorBoundary what="The welcome window">
        <Welcome />
      </ErrorBoundary>
    </MotionRoot>
  </StrictMode>
)
