import React from 'react'

/**
 * Catches render errors so the app never turns into a blank page.
 * - `level="page"`: replaces the page with a readable error + recovery buttons.
 * - `level="panel"`: only the broken panel is replaced; the rest of the page keeps working.
 * `resetKey` clears the error when it changes (e.g. navigating to another algorithm).
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[AlgoMetis] UI error in', this.props.name || 'component', error, info?.componentStack)
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, info: null })
  }
  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    const details = `${error.name}: ${error.message}\n${(info?.componentStack || '').split('\n').slice(0, 8).join('\n')}`
    if (this.props.level === 'panel')
      return (
        <div className="panel-error" role="alert">
          <strong>{this.props.name || 'This panel'} could not be shown.</strong>
          <span>{error.message}</span>
          <button className="btn sm" onClick={() => this.setState({ error: null, info: null })}>
            Try again
          </button>
        </div>
      )
    return (
      <div className="page-error" role="alert">
        <h2>This page hit an error and stopped.</h2>
        <p>The rest of AlgoMetis still works. If it keeps happening, copy the details below and send them along with what you clicked.</p>
        <pre>{details}</pre>
        <div className="row">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a className="btn" href="#/">
            Go to home
          </a>
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(details).catch(() => {})}>
            Copy details
          </button>
        </div>
      </div>
    )
  }
}
