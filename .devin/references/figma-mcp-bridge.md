# figma-mcp-bridge 0.4.0 field notes

Pinned to `@magic-spells/figma-mcp-bridge@0.4.0` (see `.devin/mcp_config.json`). Revalidate on version bump.

## Connection model (read before troubleshooting)

Two channels: `Devin agent --stdio--> bridge process (npx) <--ws://localhost:3055-- Figma plugin`.

- The bridge process is spawned by the agent host, not by Figma. The plugin is only a WebSocket client — restarting it cannot revive a dead bridge.
- If `mcp_list_tools` fails for this server: check `lsof -nP -i :3055` and `pgrep -f figma-mcp-bridge` first. No listener + no process = the host never spawned the bridge (spawn failure) — the remedy is restarting the Devin session, not the plugin. If a stale bridge holds the port, kill it.
- Diagnose the bridge before touching other MCP servers; a failing `command`-type server (`npx` stdio) says nothing about URL-type servers.

## Cost discipline

- **First step of every Figma session:** dump `mcp_list_tools` once to a scratch file and grep it for names/schemas. A validation error response appends the full tool catalog (~90 tools with schemas) — one pre-flight lookup is far cheaper than a single failure.
- Every mutation and `figma_get_nodes` returns the full node JSON (~300-600 tokens each). Plan around **template → clone-array → patch content** instead of N individual creates.
- Prefer `figma_get_children` / `figma_search_nodes` (compact) over `figma_get_nodes` (verbose). `figma_get_nodes` accepts `depth: "minimal" | "compact" | "full"` — use `minimal`/`compact` for tree traversal.
- `figma_export_node` writes a PNG to disk and returns a path — the cheap readback for visual verification.

## Batch-capable vs single-node

- Accept `nodeIds[]` or repeated IDs: `figma_clone_nodes` (**repeat the same ID for N clones in one call**), `figma_move_nodes`, `figma_resize_nodes`, `figma_delete_nodes`, `figma_get_nodes`.
- Single `nodeId` only: `figma_set_fills`, `figma_set_corner_radius`, `figma_set_text`, most `figma_create_*`.

## Known gaps (do not call / do not expect)

- Nonexistent tools: `figma_create_node`, `figma_set_position`, `figma_set_font_size`. Use `figma_move_nodes` / `figma_resize_nodes` / create tools with explicit dimensions.
- `figma_create_shape_with_text` is FigJam-only — it fails on design documents.
- No text-align setter — center text by positioning the node manually.
- No DOM/HTML import or paste tool — clipboard layer data (e.g. `figma-capture-button` output) cannot be inserted via MCP; the user pastes manually.

## Structure traps

- `figma_clone_nodes` clones the node, not sibling text overlays. **Group children (`figma_group_nodes`) or reparent (`figma_reparent_nodes`) before cloning** — flat siblings clone as bare backgrounds.
- After structural ops (create/reparent/clone into a frame), verify with `figma_get_children` that `childCount` matches — children created without a parent argument can land orphaned on the page instead of inside the frame.
- `figma_set_strokes` supports per-side weights (`strokeTopWeight` etc.) for divider lines — no need to fake them with 1px rectangles.
- `figma_clone_nodes` ignores a `count` argument — N clones require the same nodeId repeated N times in `nodeIds[]`, not a single ID plus count.
- `RECTANGLE` nodes cannot have children — `figma_create_*`/`figma_reparent_nodes` into a rectangle leaves the child orphaned on the page. Use FRAME for anything meant to contain children.
- Instance sublayers cannot be repositioned/resized (`relative-transform` is instance-internal). Text and visibility overrides via composite sublayer IDs (`I<instance>;<sublayer>`) work; geometry changes require rebuilding the element from raw layers.
- Sublayer IDs inside sibling clones follow the template's child order (e.g. 6th child of each cloned row is the action icon). Enumerating them via one `figma_get_children` per row is safer than extrapolating ID sequences — IDs may skip.
