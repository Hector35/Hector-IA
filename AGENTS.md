# Repository agent rules

## Shared context / cross-chat coordination

A chat, agent, Codex session or background worker must not treat its own transcript as the source of truth. Shared durable state lives in Héctor Context Hub, D1/R2 and the current GitHub repository state.

When the runtime has access to Héctor OS authentication, use the cross-chat sync protocol under `/api/context-sync`:

1. `POST /bootstrap` before substantial work to load shared decisions, recent commits, active work and claims.
2. `POST /claim` before starting a parallel implementation or taking ownership of a shared scope.
3. Reuse an existing claim/decision/implementation instead of creating a sibling solution when another session owns the scope.
4. `POST /commit` after meaningful work with summary, decisions, actions, next steps, blockers and resources so future sessions can resume it.
5. `POST /release` when a claimed scope is finished or intentionally abandoned.

If the runtime cannot call Context Sync directly, inspect current `main`, open PRs, `system_context`, Context Hub records and this repository before starting overlapping work. Never assume missing local chat context means the project has no prior decision.

## Canonical PWA/surface governance

Before creating, renaming, moving or replacing any app/page/manifest/service worker, read `config/pwa-registry.json`.

There are exactly three canonical installable PWAs unless Héctor explicitly authorizes creation of another installable PWA:

1. **Héctor OS** — `/` — general UI, chat, shared utilities and the owner UI for Bridge/Context features.
2. **Héctor Agent** — `/agent/` — goals, autonomous work, jobs, approvals, activity and Agent controls.
3. **Pendientes** — `/turno-rx/` — clinical workflow; protected and isolated.

`/bridge.html` and `/bridge-core.html` are surfaces of the same **Héctor Bridge** capability layer owned by Héctor OS. They are not separate PWAs. `/api/hector-bridge` is its backend.

**Context Hub** is shared context/backend infrastructure, not another PWA. If it needs UI, put that UI inside Héctor OS or Bridge unless Héctor explicitly decides to create a new PWA.

### Hard rules

- Reuse a registered surface when the requested feature fits its purpose. Do not solve a missing feature by inventing a sibling PWA or another top-level console.
- Authorization to implement a feature is **not** authorization to create a new installable PWA. A new PWA needs explicit user approval for a new PWA and a registry update in the same change.
- New manifests and service workers require a unique registered scope. Never overlap another PWA's service-worker/cache ownership.
- Do not modify `public/turno-rx/` unless the user explicitly authorizes work on Pendientes.
- Backends, brokers, memory systems, tool registries and APIs should be shared services. They do not get a new PWA by default.
- If another branch/PR is already building the same capability, extend or reconcile it instead of creating a parallel implementation.
- Before claiming a new surface is needed, state why none of the registered owners can host it.

The machine-readable registry is the source of truth. When code and prose disagree, stop and reconcile the registry rather than creating another app.
