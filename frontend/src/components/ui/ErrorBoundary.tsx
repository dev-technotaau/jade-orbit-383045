'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Report to analytics
    trackEvent('error_boundary', 'error', error.message);

    // Call custom error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  handleCopyError = () => {
    if (!this.state.error) return;
    const errorText = [
      `Error: ${this.state.error.message}`,
      `Stack: ${this.state.error.stack || 'N/A'}`,
      `Component: ${this.state.errorInfo?.componentStack || 'N/A'}`,
    ].join('\n\n');
    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--error-light)]">
            <AlertTriangle className="text-error h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Something went wrong</h2>
          <p className="mt-1.5 max-w-md text-sm text-[var(--text-muted)]">
            An unexpected error occurred. Please try again or contact support if the problem
            persists.
          </p>
          {this.state.error && (
            <div className="mt-4 w-full max-w-md">
              <pre className="overflow-auto rounded-lg bg-[var(--bg-tertiary)] p-3 text-left text-xs text-[var(--text-secondary)]">
                {this.state.error.message}
              </pre>
              <button
                type="button"
                onClick={this.handleCopyError}
                className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
              >
                <Copy className="h-3 w-3" />
                {this.state.copied ? 'Copied!' : 'Copy error details'}
              </button>
            </div>
          )}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="bg-primary hover:bg-primary-hover active:bg-primary-dark inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <Home className="h-4 w-4" />
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
