# Leish! — Documentation Set

Product, requirements, design, engineering, testing, security, and operations documentation for **Leish! Aesthetic Marketplace**. The original baseline was generated from the codebase on 2026-10-08; the expanded development pack was completed on 2026-10-12.

| # | Document | Purpose |
|---|---|---|
| 01 | [PRD](./01-prd.md) | Problem, personas, goals, epics & functional requirements, metrics, risks, release criteria |
| 02 | [TRD](./02-trd.md) | Architecture, stack, domain model, API contract, auth/security, AI integration, known defects, technical requirements (TR-1…TR-12) |
| 03 | [App Flow](./03-app-flow.md) | Navigation model, sitemap, actor states, 8 core user flows, cross-cutting states |
| 04 | [Design Brief](./04-design-brief.md) | Brand positioning, design principles, typography, color roles, components, motion, voice, accessibility |
| 05 | [Background Scheme](./05-background-scheme.md) | Espresso-gallery elevation ladder, gradients, glow orbs, scrims, CTA gradients, per-screen map, codification plan |
| 06 | [Implementation Plan](./06-implementation-plan.md) | 5 phases (32 eng-days), tasks with acceptance criteria, milestones, risks, definition of done |
| 07 | [Launch Runbook](./07-launch-runbook.md) | Deployment preflight, environment variables, smoke tests, monitoring, rollback and JWT rotation |
| 08 | [SRS](./08-srs.md) | Software requirements specification: system behavior, interfaces, quality attributes and constraints |
| 09 | [Use Cases](./09-use-cases.md) | Actor catalog, use-case narratives, alternate paths and acceptance outcomes |
| 10 | [Data Dictionary](./10-data-dictionary.md) | Domain entities, fields, validation, ownership and persistence mapping |
| 11 | [API Specification](./11-api-specification.md) | HTTP contract, authentication, request/response examples, errors and authorization matrix |
| 12 | [Test Plan](./12-test-plan.md) | Test strategy, cases, environments, release gates and current coverage gaps |
| 13 | [Security & Privacy](./13-security-privacy.md) | Threat model, privacy controls, secrets, abuse prevention and incident response |
| 14 | [Traceability Matrix](./14-traceability.md) | Traceability from product goals through requirements, tests and release criteria |
| 15 | [Architecture Decisions](./15-architecture-decisions.md) | Decision records for SPA architecture, Gemini, Firebase, persistence, routing and scope |

**Reading order:** PRD → SRS → Use Cases → TRD → API Specification → Data Dictionary → App Flow → Design Brief → Background Scheme → Test Plan → Security & Privacy → Implementation Plan → Launch Runbook → Traceability → Architecture Decisions.

**Status at time of writing:** Phase 0 is complete and deployed to production. Repository-safe portions of Phases 1–4 are implemented, including authorization hardening, routing, lazy-loaded surfaces, accessibility safeguards, analytics/SEO foundations and the launch runbook. Production Firestore verification, real geocoding, consent-backed analytics, full Workspace write flows, payments, real availability, and physical-device visual/accessibility validation remain open. See [06-implementation-plan.md](./06-implementation-plan.md#roadmap-execution-status-2026-10-09) and [07-launch-runbook.md](./07-launch-runbook.md).
