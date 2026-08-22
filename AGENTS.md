# Repository agent rules

## Shared context / cross-chat coordination

A chat, agent, Codex session or background worker must not treat its own transcript as the source of truth. Shared durable state lives in Héctor Context Hub, D1/R2, the current GitHub repository state and the append-only **Shared Context Ledger** in GitHub issue #958.

When the runtime has access to Héctor OS authentication, use the cross-chat sync protocol under `/api/context-sync`:

1. `POST /bootstrap` before substantial work to load shared decisions, recent commits, active work and overlapping activity.
2. `POST /claim` to announce the scope/intention of parallel work. Claims are presence signals, not locks; another session may work on the same scope when that is useful.
3. Compare active claims, decisions and implementations before creating a sibling solution. Reuse, integrate, replace or deliberately diverge based on evidence.
4. `POST /commit` after meaningful work with summary, decisions, actions, next steps, blockers and resources so future sessions can resume it.
5. `POST /release` when a claimed scope is finished or intentionally abandoned.

If the runtime cannot call Context Sync directly, inspect current `main`, open PRs, `system_context`, Context Hub records and GitHub issue #958 before starting overlapping work. Never assume missing local chat context means the project has no prior decision.

This coordination protocol is not a permission system. Claims are advisory and must not freeze useful parallel work.

## Canonical PWA/surface governance

Before creating, renaming, moving or replacing any app/page/manifest/service worker, read `config/pwa-registry.json` and compare it against the current task and current code.

There are exactly three canonical installable PWAs unless Héctor explicitly authorizes creation of another installable PWA:

1. **Héctor OS** — `/` — general UI, chat, shared utilities and the owner UI for Bridge/Context features.
2. **Héctor Agent** — `/agent/` — goals, autonomous work, jobs, approvals, activity and Agent controls.
3. **Pendientes** — `/turno-rx/` — clinical workflow; protected from unrelated work.

`/bridge.html` and `/bridge-core.html` are surfaces of the same **Héctor Bridge** capability layer owned by Héctor OS. `/api/hector-bridge` is its backend. **Context Hub** is shared context/backend infrastructure, not another installable PWA.

### Hard PWA rules

- Reuse a registered surface when the requested feature fits its purpose. Do not invent a sibling PWA merely because another chat lacked context.
- Authorization to implement a feature is **not** authorization to create a new installable PWA.
- A new installable PWA requires explicit user authorization specifically for a new PWA, plus a registry update in the same change.
- PWA Factory must enforce that boundary with `approvedNewPwa=true` and a non-empty `approvalReason`.
- New manifests and service workers require unique non-overlapping scopes/cache ownership.
- Do not modify `public/turno-rx/` unless the task is explicitly about Pendientes.
- Backends, brokers, memory systems and tool registries should attach to an existing owner surface by default rather than becoming new PWAs.

The distinction is intentional: **cross-chat claims are advisory; changing the canonical installable PWA set requires explicit user approval.** Shared context can evolve as reality changes, but it cannot silently reinterpret a feature request as permission to create another PWA.
