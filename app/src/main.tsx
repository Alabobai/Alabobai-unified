import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initializeSettings } from './hooks/useSettings'
import { BRAND } from './config/brand'

// Initialize settings before app renders (applies theme, font size, etc.)
initializeSettings()

document.title = BRAND.title

const themeMeta = document.querySelector('meta[name="theme-color"]')
if (themeMeta) {
  themeMeta.setAttribute('content', BRAND.colors.roseGoldGlow)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
