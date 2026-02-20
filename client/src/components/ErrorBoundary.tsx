import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-red-50 dark:bg-red-900/20 p-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
              <h2 className="font-semibold text-red-500 mb-2">Error:</h2>
              <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-sm overflow-auto mb-4 text-red-600">
                {this.state.error?.message}
              </pre>
              <h2 className="font-semibold text-red-500 mb-2">Stack trace:</h2>
              <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-auto max-h-96 text-gray-700 dark:text-gray-300">
                {this.state.error?.stack}
              </pre>
              {this.state.errorInfo && (
                <>
                  <h2 className="font-semibold text-red-500 mb-2 mt-4">Component stack:</h2>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-auto max-h-48 text-gray-700 dark:text-gray-300">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
