# Data Dictionary — Leish! Aesthetic Marketplace

**Version:** 1.0 · **Date:** 2026-10-12 · **Source:** `src/types.ts`, API schemas and `server/data-store.ts`

## Conventions

- IDs are opaque strings and must not be interpreted by clients.
- Timestamps are ISO 8601 strings in UTC.
- `date` is a local calendar date in `YYYY-MM-DD`; `time` is the user-facing local time.
- Prices are numeric RM amounts; distance is numeric kilometers.
- Server responses must never expose password hashes or private booking data to unauthorized callers.

## User

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | string | yes | Unique opaque identifier |
| `name` | string | yes | Non-empty display name |
| `email` | string | yes | Normalized email; unique for login |
| `role` | enum | yes | `client`, `provider`, `admin` |
| `phone` | string | no | User-supplied contact value |
| `avatar` | string | no | Safe image URL |
| `salonId` | string | provider | Provider ownership anchor |
| `bio` | string | no | Profile text |
| `createdAt` | ISO string | yes | Creation timestamp |

## Salon / MUA listing

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | string | yes | Unique listing identifier |
| `type` | enum | yes | `studio` or `mua` |
| `name`, `tagline`, `description` | string | yes | Public catalog content |
| `rating` | number | yes | Display rating, bounded to 0–5 |
| `reviewCount` | integer | yes | Zero or greater |
| `location`, `address` | string | yes | Public location copy |
| `image`, `gallery[]` | URL/string[] | yes | Portfolio media |
| `category` | string | yes | Catalog category |
| `services[]` | Service[] | yes | Provider-owned service menu |
| `staff[]` | StaffMember[] | no | Studio staff roster |
| `workingHours` | object | no | Day/time availability description |
| `travelRadius` | number | MUA | Radius in km |
| `startingPrice` | number | no | RM amount |

## Service and staff

`Service` contains `id`, `name`, `price` (RM), `duration` (minutes), `description`, and `category`. `StaffMember` contains `id`, `name`, `role`, `avatar`, and `rating`.

## Booking

`Booking` contains `id`, `salonId`, `salonName`, `salonAddress`, `serviceId`, `serviceName`, `servicePrice`, `serviceDuration`, optional `staffId`/`staffName`, `date`, `time`, `clientName`, `clientEmail`, `clientPhone`, optional `notes`, `status`, `createdAt`, optional `isLocationEvent`, `eventVenue`, `travelSurcharge`, and `attachedMoodboard`.

`status` is one of `pending`, `confirmed`, `completed`, `cancelled`. The API must treat client email and salon ownership as authorization attributes, not as trusted client input.

## Review and moodboard

`Review` contains `id`, `salonId`, `clientName`, `rating`, `text`, and `date`. A `LookbookItem` contains look name, category, vibe, palette entries, complexion, eye artistry, lip formula, longevity features, optional grounded trend context, recommended salon/service, hero image and lighting guidance.

## Persistence mapping

| Logical entity | Current local store | Intended durable store |
|---|---|---|
| Users | `users` array in JSON | Firestore `users/{id}` |
| Salons | `salons` array in JSON | Firestore `salons/{id}` |
| Bookings | `bookings` array in JSON | Firestore `bookings/{id}` |
| Reviews | `reviews` array in JSON | Firestore `reviews/{id}` |

The JSON store is a development/test fallback. Production selection must be explicit and verified with migration, concurrency and redeploy tests.
