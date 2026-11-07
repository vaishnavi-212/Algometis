import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary level="page" name="app">
    <App />
  </ErrorBoundary>
)
