import '../styles/base.css'
import '../styles/ui.css'
import './explain.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Explain } from './Explain'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Explain />
  </StrictMode>
)
