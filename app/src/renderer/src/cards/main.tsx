import '../styles/base.css'
import '../styles/ui.css'
import './cards.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MyCards } from './MyCards'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary what="My cards">
      <MyCards />
    </ErrorBoundary>
  </StrictMode>
)
