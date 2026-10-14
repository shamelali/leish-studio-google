/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main className="flex min-h-screen items-center justify-center bg-canvas p-4" role="alert">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-elevated p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-surface/10">
              <AlertCircle aria-hidden="true" className="h-8 w-8 text-danger" />
            </div>
            <h1 className="font-serif text-xl font-semibold text-fg">Something went wrong</h1>
            <p className="text-sm text-fg-muted">
              An unexpected error occurred. Try again to reload this part of the experience.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center space-x-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              <span>Try Again</span>
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
