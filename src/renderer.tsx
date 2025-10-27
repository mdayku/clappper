import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

console.log('Renderer starting...')
const rootEl = document.getElementById('root')
console.log('Root element:', rootEl)

if (!rootEl) {
  console.error('Root element not found!')
  document.body.innerHTML = '<h1 style="color: red; padding: 20px;">ERROR: Root element not found</h1>'
} else {
  try {
    createRoot(rootEl).render(<App />)
    console.log('React app mounted successfully')
  } catch (err) {
    console.error('Failed to mount React app:', err)
    document.body.innerHTML = `<h1 style="color: red; padding: 20px;">ERROR: ${err}</h1>`
  }
}

