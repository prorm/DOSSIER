# DOSSIER Architecture & Technical Decisions

> Official Architecture Decision Record (ADR) documenting core technical trade-offs, protocols, and implementation choices in **DOSSIER**.

---

## 1. Dual-Runtime Database: PGlite & Postgres
- **Context**: The platform must support single-command local evaluation by students/judges without requiring a running Docker daemon or cloud database, while scaling seamlessly to production PostgreSQL for multi-thousand-participant college fests.
- **Decision**: Implemented a unified database client abstraction (`src/server/db/client.ts`) supporting both `@electric-sql/pglite` (WebAssembly-compiled in-process Postgres) and native `postgres.js`.
- **Consequence**: Developers can run `pnpm test` or local dev completely in-memory with zero setup; switching to production requires only setting `DATABASE_URL=postgres://...`.

---

## 2. Cryptographic Security & QR Anti-Replay
- **Context**: Live checkpoint games in college fests are vulnerable to screenshot sharing, badge replay, and token tampering across team chats.
- **Decision**: Checkpoint tokens and team badges use compact HMAC-SHA256 signed payloads (`<header>.<payload>.<signature>`):
  - **Purpose Separation**: Checkpoint signs use `purpose: "checkpoint"`; participant badges use `purpose: "badge"`. They cannot be interchanged.
  - **Version Rotation**: Checkpoints have a `tokenVersion` counter. Staff can invalidate all printed QR signs instantly from the admin console.
  - **Replay Protection**: Live team badges contain single-use nonce fingerprints stored in the database. A replayed photo or forwarded screenshot immediately fails verification.

---

## 3. Realtime Event Bus & State Synchronization
- **Context**: Thousands of concurrent players watching live leaderboards and waiting for first-blood announcements would overwhelm standard WebSocket connection state in serverless or containerized environments.
- **Decision**: Implemented Server-Sent Events (SSE) via `/api/stream` backed by an in-memory event bus with pub/sub topic routing (`src/server/realtime/bus.ts`).
- **Consequence**:
  - SSE uses standard HTTP/1.1 or HTTP/2, passing through restrictive campus firewalls that block raw WebSockets.
  - Automatic fallback polling kicks in if client connections drop.
  - Architecture is designed for drop-in Redis Pub/Sub adapter when horizontally scaling to multi-node clusters.

---

## 4. Scoring Engine & Anti-Brute-Force Protection
- **Context**: Competitions require dynamic scoring to reward difficult challenges and prevent score ties, but must resist automated dictionary attacks against flag submission endpoints.
- **Decision**:
  - **Dynamic Decay**: Points decrease according to $P(s) = P_{\min} + (P_{\max} - P_{\min}) \cdot e^{-s / k}$, where $s$ is solve count.
  - **First Blood**: The first solver is granted a non-decaying bonus recorded atomically via a partial unique index.
  - **Rate Limiting**: Teams get 4 free misses per challenge. The 5th miss triggers a 2-second cooldown that doubles on subsequent failures ($2\text{s} \to 4\text{s} \to 8\text{s} \dots$). Global team burst limits cap aggregate attempts across all challenges.
  - **Answer Secrecy**: Answers are normalized and hashed with Argon2id or HMAC-SHA256 (`ANSWER_SECRET`). Raw answers never exist in database tables or logs.

---

## 5. Content Pack Schema & Cyclic Dependency Detection
- **Context**: Content creators need a clean, version-controlled format to design events without writing code.
- **Decision**: Event packs are authored in human-readable YAML (`event.yaml`, `challenges/*.yaml`, `story.yaml`, `checkpoints.yaml`) and validated strictly against Zod schemas (`src/server/packs/schema.ts`).
- **Consequence**: The validator detects cyclic dependency graphs (`A requires B, B requires A`) before import, verifies all asset file existence, hashes assets with SHA-256 for tamper prevention, and precomputes answer hashes on ingest.

---

## 6. Interactive Evidence Board State Architecture
- **Context**: Inquest mode requires an interactive corkboard where teammates can collaborate on suspect investigation without overwriting each other's layouts.
- **Decision**: The board state is stored as a team-private JSON document with optimistic concurrency control (`version` counter). Op-based mutations (`place`, `link`, `pin`, `annotate`) are merged server-side and broadcast over SSE to active teammates.
