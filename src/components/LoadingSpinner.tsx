/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-12" role="status" aria-live="polite">
      <Loader2 aria-hidden="true" className={`${sizeClasses[size]} animate-spin text-accent-text`} />
      {message && (
        <p className="text-xs font-mono text-fg-muted">{message}</p>
      )}
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex items-baseline font-serif text-4xl font-semibold tracking-tight text-brand-champagne">
          <span>Lei</span>
          <span className="text-brand-gold italic font-bold">sh</span>
          <span className="text-brand-champagne text-3xl ml-0.5">!</span>
        </div>
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-accent-text" />
        <p className="text-xs font-mono text-fg-muted">Loading your beauty experience...</p>
      </div>
    </div>
  );
}
