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

This protocol is a coordination system, **not a permission system**. Shared context should make decisions smarter, not prevent action.

## Intelligent PWA/surface coordination

Before creating, renaming, moving or replacing any app/page/manifest/service worker, read `config/pwa-registry.json` and compare it against the current task and current code.

The current canonical installable PWAs are:

1. **Héctor OS** — `/` — general UI, chat, shared utilities and the owner UI for Bridge/Context features.
2. **Héctor Agent** — `/agent/` — goals, autonomous work, jobs, approvals, activity and Agent controls.
3. **Pendientes** — `/turno-rx/` — clinical workflow; protected from unrelated work.

`/bridge.html` and `/bridge-core.html` are currently surfaces of the same **Héctor Bridge** capability layer owned by Héctor OS. `/api/hector-bridge` is its backend. **Context Hub** is currently shared context/backend infrastructure.

These are current architectural defaults, not artificial brakes. Reuse an existing surface when that is the simplest coherent architecture. If a new PWA or top-level surface is genuinely better, an agent may create it within the authorized task, but it must explain the concrete product/technical advantage, avoid scope/cache collisions and update the registry so every other agent sees the new reality.

### Operating rules

- Prefer reuse when it reduces duplication; prefer separation when it has a concrete product or technical benefit.
- Do not create parallel implementations merely because another chat lacked context. Inspect concurrent work first and reconcile when useful.
- Do not block work solely because a registry entry, claim or prior design says something different; compare against current objective and evidence, then update stale shared context.
- New manifests and service workers must have non-overlapping scopes/cache ownership.
- Do not modify `public/turno-rx/` unless the task is explicitly about Pendientes.
- Backends, brokers, memory systems and tool registries should usually be shared services, but this is an architectural preference rather than a hard prohibition.
- When agents disagree, preserve both claims with evidence and resolve against current code, tests and production state.

The registry, Context Hub, claims and ledger are shared state, not immutable law. If reality changes, update them instead of silently diverging.
