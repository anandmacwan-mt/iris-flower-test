import React, { Component } from 'react'
import { createRoot } from 'react-dom/client'
import { Leva } from 'leva'
import './styles.css'
import { App } from './App'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#900' }}>
          <h2>Render error</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
    <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
  </ErrorBoundary>
)
