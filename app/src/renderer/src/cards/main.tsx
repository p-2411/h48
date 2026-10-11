import '../styles/base.css'
import '../styles/ui.css'
import '../review/review.css'
import './cards.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MyCards } from './MyCards'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MyCards />
  </StrictMode>
)
