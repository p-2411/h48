import '../styles/base.css'
import '../styles/ui.css'
import './welcome.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Welcome } from './Welcome'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary what="The welcome window">
      <Welcome />
    </ErrorBoundary>
  </StrictMode>
)
