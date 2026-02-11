import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initializeSettings } from './hooks/useSettings'

// Initialize settings before app renders (applies theme, font size, etc.)
initializeSettings()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
