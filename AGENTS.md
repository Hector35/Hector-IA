# Repository agent rules

## Shared context / cross-chat coordination

A chat, agent, Codex session or background worker must not treat its own transcript as the source of truth. Shared durable state lives in Héctor Context Hub, D1/R2, current GitHub state and the append-only **Shared Context Ledger** in GitHub issue #958.

When the runtime can reach Héctor OS, use `/api/context-sync`:

1. `POST /bootstrap` before substantial work to load shared decisions, recent commits, active work and overlapping activity.
2. `POST /claim` to announce scope/intention. Claims are presence signals, never locks.
3. Compare overlapping work and choose intelligently: reuse, integrate, replace or deliberately diverge based on evidence.
4. `POST /commit` after meaningful work with summary, decisions, actions, next steps, blockers and resources.
5. `POST /release` when the announced scope is finished or abandoned.

If Context Sync is not callable, inspect current `main`, open PRs, Context Hub/system context and issue #958. Missing local chat context never means no prior decision exists.

**Shared context is intelligence infrastructure, not a permission system.** It should reduce accidental duplication without preventing a better implementation.

## Autonomy and alternatives

Héctor has explicitly asked the system to search for viable technical alternatives and execute them without repeatedly asking permission for implementation choices. Therefore:

- Do not invent internal approval gates, boolean permission flags or workflow locks merely to coordinate agents.
- When one implementation fails, diagnose the failure and try another legitimate route when useful.
- Existing architecture is evidence, not dogma. Prefer reuse when it is simpler/better; replace or split when evidence supports it.
- Continue independent work when one capability is unavailable instead of freezing the entire objective.
- Mandatory external authorization/security/provider controls remain authoritative; do not route around them.
- Never expose secrets. Use the Credential Broker, Worker secrets, OAuth/service identities or other provider-supported mechanisms.

## Current surfaces

Read `config/pwa-registry.json` before changing app/page/manifest/service-worker ownership. It describes the current architecture:

1. **Héctor OS** — `/` — general UI, chat, shared utilities, Bridge/Context surfaces.
2. **Héctor Agent** — `/agent/` — autonomous goals, jobs, activity and Agent controls.
3. **Pendientes** — `/turno-rx/` — clinical workflow; isolated from unrelated work.

`/bridge.html`, `/bridge-core.html`, `/api/hector-bridge`, Context Hub and `/mcp` are parts of the shared Héctor capability layer, not separate PWAs.

### Architecture rules

- Reuse a registered owner when that is the cleanest solution; do not create a sibling because another chat lacked context.
- Claims are advisory and do not lock implementation work, but changing the installable PWA set is a separate boundary and requires explicit user approval.
- There are exactly three canonical installable PWAs unless Héctor explicitly authorizes another one. Authorization to implement a feature, correction or architectural improvement is not authorization to create a new installable PWA.
- A new installable PWA requires `approvedNewPwa=true` plus a non-empty `approvalReason` that documents the explicit user authorization.
- When creating an explicitly authorized new installable PWA, update the registry in the same change and use a unique, non-overlapping service-worker/cache scope.
- Do not modify `public/turno-rx/` for unrelated work.
- Backends, brokers, memory, credentials and tool registries should usually remain shared services rather than multiplying UI surfaces.

## Maximum-capability architecture

Prefer one connected stack instead of parallel subsystems:

`ChatGPT/API/MCP -> Héctor Bridge -> Context Hub + Context Sync -> Capability Router -> Credential Broker -> tools/providers -> verification/evidence -> durable state`

- Remote MCP endpoint: `/mcp`.
- Machine-token provisioning: `/api/hector-bridge/access/tokens`.
- Encrypted credential metadata/material: `/api/hector-bridge/access/credentials`.
- Universal fallback execution: `/api/hector-bridge/capabilities/execute`.
- Capability observability: `/api/hector-bridge/capabilities/traces`.

Before adding another broker, memory system, router or agent control plane, extend these shared layers unless there is a concrete architectural reason not to.
