/**
 * Small, provider-agnostic analytics boundary.
 *
 * The default export intentionally does nothing. A host application can inject
 * a sink with createAnalytics without adding a third-party SDK or sending
 * identifiers over the network. Payloads are allow-listed to coarse product
 * events and known sensitive fields are dropped before reaching a sink.
 */

export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'view_listing',
  'booking_started',
  'booking_completed',
  'booking_failed',
  'auth_completed',
  'search_submitted',
  'ai_fallback_shown',
  'lookbook_attached',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  properties: Record<string, AnalyticsValue>;
}

export type AnalyticsSink = (event: AnalyticsEvent) => void;

const SENSITIVE_FIELD = /(email|phone|name|password|token|address|venue|note|message|avatar|ip)/i;

function sanitizeProperties(properties: AnalyticsProperties = {}): Record<string, AnalyticsValue> {
  return Object.entries(properties).reduce<Record<string, AnalyticsValue>>((safe, [key, value]) => {
    if (SENSITIVE_FIELD.test(key) || value === undefined) return safe;

    if (typeof value === 'string') {
      // Keep accidental free-form values from becoming a user-content channel.
      safe[key] = value.slice(0, 120);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === 'boolean') {
      safe[key] = value;
    }
    return safe;
  }, {});
}

export interface Analytics {
  track: (name: AnalyticsEventName, properties?: AnalyticsProperties) => void;
}

export function createAnalytics(sink: AnalyticsSink = () => undefined): Analytics {
  return {
    track(name, properties) {
      try {
        sink({ name, properties: sanitizeProperties(properties) });
      } catch {
        // Analytics must never affect the booking or discovery experience.
      }
    },
  };
}

/** Privacy-safe default. No network request, storage, cookie, or console output. */
export const analytics = createAnalytics();
