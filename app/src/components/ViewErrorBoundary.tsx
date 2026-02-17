import React from 'react'
import { AlertTriangle, RefreshCw, Home, Copy } from 'lucide-react'

type Props = {
  children: React.ReactNode
  title?: string
  onReset?: () => void
}

type State = {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export default class ViewErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ViewErrorBoundary] View crashed:', error)
    console.error('[ViewErrorBoundary] Component stack:', errorInfo.componentStack)
    this.setState({ errorInfo })

    // You could send this to an error reporting service here
    // Example: reportError({ error, errorInfo, timestamp: new Date() })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  handleCopyError = async () => {
    const { error, errorInfo } = this.state
    const errorText = `
Error: ${error?.message || 'Unknown error'}
Stack: ${error?.stack || 'No stack trace'}
Component Stack: ${errorInfo?.componentStack || 'No component stack'}
Timestamp: ${new Date().toISOString()}
View: ${this.props.title || 'Unknown view'}
    `.trim()

    try {
      await navigator.clipboard.writeText(errorText)
      // Show a brief visual feedback
      const btn = document.getElementById('copy-error-btn')
      if (btn) {
        btn.textContent = 'Copied!'
        setTimeout(() => {
          btn.textContent = 'Copy Error Details'
        }, 2000)
      }
    } catch (e) {
      console.error('Failed to copy error:', e)
    }
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state

      return (
        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-dark-500/95 via-dark-400/90 to-dark-500/95 p-6">
          <div className="max-w-lg w-full">
            {/* Error Card */}
            <div className="morphic-card rounded-2xl border border-rose-gold-400/30 bg-rose-gold-500/5 p-8 text-center backdrop-blur-lg">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-rose-gold-500/20 border border-rose-gold-400/30 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-rose-gold-400" />
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white mb-2">
                {this.props.title || 'Something went wrong'}
              </h2>

              {/* Error Message */}
              <p className="text-white/60 text-sm mb-4">
                An unexpected error occurred while rendering this view.
              </p>

              {/* Error Details (collapsed by default in production) */}
              {error && (
                <div className="morphic-card rounded-lg bg-dark-500/50 p-4 mb-6 text-left">
                  <p className="text-xs font-mono text-rose-gold-400 break-all">
                    {error.message}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={this.handleReset}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-gold-400 to-rose-gold-600 text-dark-500 font-semibold text-sm hover:from-rose-gold-300 hover:to-rose-gold-500 transition-all shadow-glow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all text-sm"
                >
                  <Home className="w-4 h-4" />
                  Refresh Page
                </button>
              </div>

              {/* Copy Error Details */}
              <button
                id="copy-error-btn"
                onClick={this.handleCopyError}
                className="mt-6 flex items-center justify-center gap-2 mx-auto text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy Error Details
              </button>
            </div>

            {/* Help Text */}
            <p className="text-center text-xs text-white/30 mt-4">
              If this problem persists, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
