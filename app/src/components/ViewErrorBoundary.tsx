import React from 'react'

type Props = {
  children: React.ReactNode
  title?: string
}

type State = {
  hasError: boolean
}

export default class ViewErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[ViewErrorBoundary] View crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-black p-6">
          <div className="max-w-md w-full rounded-xl border border-red-400/30 bg-red-400/10 p-5 text-center">
            <p className="text-red-300 font-semibold mb-2">{this.props.title || 'This view crashed'}</p>
            <p className="text-white/70 text-sm mb-4">Please refresh or switch views and try again.</p>
            <button
              className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={() => this.setState({ hasError: false })}
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
