import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AppRoutes } from './App'
import { createMemoryRepository } from './data/memoryRepository'
import './styles.css'

const repository = createMemoryRepository()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes repository={repository} />
    </BrowserRouter>
  </StrictMode>,
)
