# Implementation ledger

Plan: ../game-pilot-mcp-plan.md. Specification approved; user authorized continuous implementation in this session.

Ruling: new isolated repository under outputs/game-pilot-mcp on implementation branch; no worktree of an unrelated repository — avoids changing existing projects — no shared checkout baseline exists.

Ruling: D1 stores one versioned CAS document per session rather than seven relational tables — makes lease/observation/graph/command transitions atomic in one conditional SQL update and directly testable with SQLite — each session has an explicit 850 KB capacity; larger runs must export and start new sessions until normalized archival is added.

Access preflight: local gh token invalid; Wrangler unauthenticated. Continue implementation; remote creation/deployment remains to be verified through other authorized access.

Tasks 1–3 and 4B: tests written and observed failing before implementation. Seven core tests cover contracts, CAS, leases/dedup/uncertainty, batches, semantic graph, run control and speed fallback. Validation pending.
