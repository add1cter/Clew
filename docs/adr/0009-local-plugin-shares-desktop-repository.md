# 0009 — Personal local plugin shares the desktop repository

Status: accepted for this personal fork.

The hosted Clew plugin has no supported progress write interface. Its implementation is separate from the public desktop source. Repeated package import would create competing graphs rather than keep progress current.

Provide a separate, opt-in stdio MCP App named Clew Local. The existing read-only MCP server remains unchanged. The desktop executable runs the bridge with `--local-bridge --db ... --ui ...`. It opens the explicitly configured existing desktop database, without a new HTTP listener, account login, or seeded fallback database. Its UI is built from this fork's React and graph components, not copied from hosted assets.

There is one source of truth: SQLite workspace snapshots. Reading never imports or rewrites the graph. Desktop and plugin instances check revisions and refresh visible views. Polling pauses during desktop edits and completion tests; stale responses cannot replace newer data. The plugin does not provide completion tests; existing desktop tests and their results appear through the shared graph.

Progress writes have a durable review record with a ten-minute expiry. The model may prepare a review but the apply tool is app-only. The user's Apply action rechecks graph revision, topic state and completion rules inside `BEGIN IMMEDIATE`; it commits a snapshot and idempotent receipt together. This boundary uses the repository's transaction helpers so it retains monotonic versions, conflict protection, rollback and cross-process cache invalidation. With closure tests enabled, closed states require existing passing evidence and current prerequisite eligibility. With tests disabled, explicit manual progress remains possible. No quiz results are fabricated.

The resource is self-contained with no network CSP allowlist. The bridge projects graph content and progress, not workspace connection configuration or OS credentials. As with any local MCP server, trusted host code controls tool visibility; this is not a security boundary against a hostile local process. A Codex conversation can read the learning context when the plugin is used, so the plugin's local transport does not imply that the assistant's inference runs locally.

This does not synchronize the hosted plugin, other computers, or other users. They require a separate authenticated protocol and identity/conflict design. Rollback restores workspace state but preserves historical review receipts; replaying an applied review never reapplies an old change.
