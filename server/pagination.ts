/**
 * Shared pagination helpers for list endpoints (FR-006).
 *
 * Contract (frozen): `{ data, pagination: { page, limit, total, pages } }`.
 * `page` is 1-based (default 1); `limit` defaults to 20 and caps at 100.
 * Validation lives in `server/validation.ts` (pageQuerySchema); invalid
 * values are rejected with 400 before these helpers run.
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface PageParams {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export function paginate<T>(rows: T[], total: number, params: PageParams): Paginated<T> {
  return {
    data: rows,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / params.limit),
    },
  };
}

/** Total page count for an envelope (`pages`), rounding up; 0 rows → 0 pages. */
export function pageCount(total: number, limit: number): number {
  return total === 0 ? 0 : Math.ceil(total / limit);
}

/** Offset for `page` (1-based) with `limit` rows per page. */
export function pageOffset(params: PageParams): number {
  return (params.page - 1) * params.limit;
}

/** Slice an in-memory ordered array into a page (JSON store + test fakes). */
export function slicePage<T>(ordered: T[], params: PageParams): Paginated<T> {
  return paginate(ordered.slice(pageOffset(params), pageOffset(params) + params.limit), ordered.length, params);
}
