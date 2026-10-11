import '../styles/base.css'
import '../styles/ui.css'
import '../explain/explain.css'
import '../review/review.css'
import './panel.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Panel } from './Panel'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary what="The side panel">
      <Panel />
    </ErrorBoundary>
  </StrictMode>
)
