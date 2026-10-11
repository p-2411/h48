import '../styles/base.css'
import './tutor.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Tutor } from './Tutor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tutor />
  </StrictMode>
)
