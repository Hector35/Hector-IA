# Repository agent rules

## Shared context first

Before starting meaningful work, reconstruct the current state from the strongest shared sources available:

1. current `main`;
2. open PRs/branches touching the same capability;
3. `config/pwa-registry.json` for current surface ownership;
4. Context Hub / persistent project context when available;
5. GitHub issue #958, **Shared Context Ledger — Héctor IA / Héctor OS**, for recent cross-chat decisions and handoffs.

After a meaningful decision, discovery, implementation, failure or verified result, leave a compact handoff in the shared context/ledger so another chat can resume without repeating the investigation.

This is a coordination protocol, **not a permission system**. Context should improve judgment, not prevent action.

## Intelligent surface coordination

The current canonical installable PWAs are:

1. **Héctor OS** — `/` — general UI, chat, shared utilities and owner UI for Bridge/Context features.
2. **Héctor Agent** — `/agent/` — goals, autonomous work, jobs, approvals, activity and Agent controls.
3. **Pendientes** — `/turno-rx/` — clinical workflow; protected and isolated from unrelated work.

`/bridge.html` and `/bridge-core.html` are surfaces of the same **Héctor Bridge** capability layer owned by Héctor OS. `/api/hector-bridge` is its backend. **Context Hub** is shared context/backend infrastructure rather than an installable PWA.

These are defaults and current ownership, not artificial brakes. Reuse an existing surface when that is the simplest coherent architecture. If a new PWA or top-level surface is genuinely better, an agent may propose or implement it when the task authorizes the required code change, but it must explain the architectural benefit, avoid scope/cache collisions, and update the registry so every other agent sees the new reality.

### Operating rules

- Prefer reuse when it reduces duplication; prefer a new surface when separation has a concrete product or technical advantage.
- Do not create parallel implementations merely because another chat lacked context. Inspect concurrent work first and reconcile when useful.
- Do not block work solely because a registry entry, approval flag or prior design says something different; compare against the current objective and evidence, then update stale shared context.
- New manifests and service workers must have non-overlapping scopes/cache ownership.
- Do not modify `public/turno-rx/` unless the task is explicitly about Pendientes.
- Backends, brokers, memory systems and tool registries should usually be shared services, but this is an architectural preference rather than a hard prohibition.
- When agents disagree, preserve both claims with evidence and resolve against current code, tests and production state.

The registry and ledger are shared state, not immutable law. If reality changes, update them instead of silently diverging.
