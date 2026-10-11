import '../styles/base.css'
import './overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Overlay } from './Overlay'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary what="The strip">
      <Overlay />
    </ErrorBoundary>
  </StrictMode>
)
