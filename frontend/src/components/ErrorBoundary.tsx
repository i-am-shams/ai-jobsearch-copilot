import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so one bad row cannot blank the entire app.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which produces a completely white page with the real error visible only in the
 * console - the most confusing possible failure for a user to report.
 *
 * Still a class component: error boundaries are the one React feature with no
 * hooks equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="boundary" role="alert">
        <h2>Something broke on this page</h2>
        <p>
          The error has been logged to the browser console. Reloading usually clears it.
        </p>
        <pre className="boundary__detail">{this.state.error.message}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
