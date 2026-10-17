/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Admin Reviews — moderate all reviews across the marketplace.
 * View reviews, delete inappropriate ones.
 */
import React, { useCallback, useState } from 'react';
import { adminReviewsApi } from '../lib/api';
import type { Review } from '../types';
import {
  MessageCircle as MessageIcon,
  Trash2 as TrashIcon,
  Star as StarIcon,
  Save as SaveIcon,
} from 'lucide-react';

interface ReviewRowProps {
  review: Review;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function ReviewRow({ review, onDelete, isDeleting }: ReviewRowProps) {
  const handleDelete = async () => {
    if (!window.confirm(`Delete review #${review.id.slice(-8)} by ${review.clientName}?`)) return;
    onDelete(review.id);
  };

  const stars = '★★★★★'.slice(0, Math.round(review.rating)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(review.rating));

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs font-mono text-brand-gold">{stars}</span>
            <span className="text-xs font-mono text-fg-dim">{review.rating}</span>
          </div>
          <p className="text-sm text-fg truncated">{review.text}</p>
          <p className="text-xs font-mono text-fg-muted">
            {review.clientName} • {review.salonId} • {review.date}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-lg border border-line bg-inset px-2.5 py-2 text-xs text-fg-muted hover:bg-danger-surface/40 hover:text-danger transition-colors disabled:opacity-50"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function AdminReviews() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [data, setData] = useState<{ data: Review[]; pagination: { page: number; limit: number; total: number; pages: number } } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const loadReviews = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);
    try {
      const result = await adminReviewsApi.getAll({ page, limit });
      setData(result);
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Could not load reviews.' });
    } finally {
      setIsLoading(false);
    }
  }, [page, limit]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(prev => new Set([...prev, id]));
    setNotice(null);
    try {
      await adminReviewsApi.remove(id);
      setNotice({ kind: 'success', text: 'Review deleted.' });
      loadReviews();
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Could not delete review.' });
    } finally {
      setDeleting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [loadReviews]);

  React.useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const reviews = data?.data ?? [] as Review[];
  const pagination = data?.pagination;

  if (isLoading && !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="font-serif text-2xl text-fg mb-6">Review Moderation</h2>
        <div className="h-32 rounded-2xl border border-line bg-panel animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-fg">Review Moderation</h2>
          <p className="text-xs text-fg-muted">Review all client reviews across the marketplace.</p>
        </div>
        {notice && (
          <div className={`flex items-center space-x-2 rounded-xl border p-3 text-xs ${
            notice.kind === 'error'
              ? 'border-danger-border/30 bg-danger-surface/40 text-danger'
              : 'border-success-border/30 bg-success-surface/40 text-success'
          }`}>
            {notice.kind === 'error' ? <TrashIcon className="h-4 w-4 shrink-0" /> : <SaveIcon className="h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line overflow-hidden">
        <div className="border-b border-line bg-panel-mid px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageIcon className="h-4 w-4 text-accent-text" />
            <span className="text-xs font-mono uppercase tracking-widest text-fg-dim">{pagination?.total ?? 0} Reviews</span>
          </div>
        </div>

        <div className="divide-y divide-line">
          {reviews.map(review => (
            <ReviewRow
              key={review.id}
              review={review}
              onDelete={handleDelete}
              isDeleting={deleting.has(review.id)}
            />
          ))}
          {reviews.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-fg-muted">No reviews found.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="border-t border-line bg-inset px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-mono text-fg-dim">
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-line bg-inset px-2.5 py-1.5 text-xs text-fg-muted hover:bg-surface transition-colors disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="rounded-lg border border-line bg-inset px-2.5 py-1.5 text-xs text-fg-muted hover:bg-surface transition-colors disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}