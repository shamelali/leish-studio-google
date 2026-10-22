# Requirements Traceability Matrix — Leish! Aesthetic Marketplace

**Version:** 1.0 · **Date:** 2026-10-12

| Goal / outcome | Product requirements | SRS / technical controls | Use cases | Test evidence | Release gate |
|---|---|---|---|---|---|
| Fast trustworthy discovery | FR-1.1…FR-1.7, FR-2.1…FR-2.6 | SRS-F-001/002, SRS-Q-003/004 | UC-01 | T-001, T-002, T-016, T-017 | PRD G1 |
| Convert browsing to bookings | FR-3.1…FR-3.5 | SRS-F-003, SRS-Q-002/006 | UC-02 | T-003…T-005, T-015 | PRD G2 |
| Useful AI differentiation | FR-4.x, FR-5.x, FR-10.x | SRS-F-007, AI API envelope | UC-07/08 | T-014, T-015 | PRD G3 |
| Provider weekly utility | FR-6.x, FR-7.x | SRS-F-005/006, ownership rules | UC-04/05/06 | T-008…T-013 | PRD G4 |
| Workspace capability | FR-8.x | SRS-F-008, OAuth scope controls | UC-09 | Manual OAuth smoke | PRD G5 |
| Safe account handling | FR-9.x, NFR-1…NFR-3 | JWT, bcrypt, authz matrix | UC-03 | T-006…T-011 | Security acceptance |
| Durable production data | NFR-7, TR-2 | DataStore interface and migration | UC-10 | T-018 + emulator | PRD release criterion |
| Launch readiness | PRD release criteria | CI, runbook, rollback | UC-10 | typecheck/test/build/smoke | 07 Launch Runbook |

## Traceability rules

Every new product requirement must receive an ID, an SRS reference, an implementation owner, and at least one executable or manual test. A requirement marked complete without evidence is considered unverified. When behavior changes, update PRD, SRS, API/data docs and tests together.

## Current unverified items

Production Supabase durability and backup/restore, real distance calculation, Workspace write flows, consent-backed analytics delivery, payments, real availability and full visual/accessibility audit remain intentionally open and must not be reported as complete.
