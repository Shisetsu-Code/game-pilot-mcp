# Implementation ledger

Plan: ../game-pilot-mcp-plan.md. Specification approved; user authorized continuous implementation in this session.

Ruling: new isolated repository under outputs/game-pilot-mcp on implementation branch; no worktree of an unrelated repository — avoids changing existing projects — no shared checkout baseline exists.

Ruling: D1 stores one versioned CAS document per session rather than seven relational tables — makes lease/observation/graph/command transitions atomic in one conditional SQL update and directly testable with SQLite — each session has an explicit 850 KB capacity; larger runs must export and start new sessions until normalized archival is added.

Access preflight: first sandboxed gh check reported invalid authentication. Network-authorized verification proved gh is authenticated as Shisetsu-Code; the first report was a network sandbox false negative. Private empty remote https://github.com/Shisetsu-Code/game-pilot-mcp created successfully. Wrangler remains unauthenticated.

Tasks 1–8 and 4B: implemented with tests observed failing before implementation. Before final review, 19 unit/runtime tests and 7 browser tests passed, including four Chromium processes/eight contexts, 56 actions and private exports. Cloudflare deployment dry-run passed. One official CandyRush DEMO frame was opened/captured successfully with no purchases/spins.

Task 9: GitHub publication in progress; Cloudflare production deployment and real ChatGPT connection require authentication. No production endpoint is claimed.

Ruling: form batches immediately from ready observations instead of adding the optional 300 ms window — avoids an artificial wait — individual small batches may carry fewer than eight games.

Ruling: acceleration is restricted to accessible Web Animations in the initial implementation — preserves real timers and avoids unvalidated canvas-clock patches — some game engines remain at 1× until a validated native adapter is available.

Final independent review: seven Important findings reproduced. Regression tests were written and all seven observed failing against c7ae1ea. One fix pass followed, with all 26 focused core/browser tests passing:

- Final: fixed journal-to-input geometry race — frame movement during journal request blocks input after durable intent RED→GREEN.
- Final: fixed active bonus continuation gate — linked Continue/Pick allowed while original purchase remains unverified, new buy/spin and premature verification rejected RED→GREEN.
- Final: fixed clipped/bordered iframe coordinates — correct content origin, scale and viewport intersection RED→GREEN.
- Final: fixed reused pause acknowledgment — new control generation and matched runner acknowledgment RED→GREEN.
- Final: fixed visual BFS destinations — unclassified observations do not create semantic nodes; edges resolve on annotation RED→GREEN.
- Final: fixed replay source provenance — immutable pre-input observation/image/geometry/state snapshot in each command RED→GREEN.
- Final: fixed menu-page option loss — merge by stable option/configuration ID with page provenance, preserving earlier unpurchased options RED→GREEN.

Final: minor (deferred): historical design/plan documents preserve earlier proposal status and unchecked execution steps; current implementation and acceptance status are in README and this ledger.

Final: Ruling: production deployment and real ChatGPT connection remain unverified until Cloudflare authentication — no available authenticated deployment account — cannot call the remote MCP active yet.

Final: Ruling: real-provider purchase/bonus acceptance is not inferred from the read-only CandyRush probe — synthetic workflows verify infrastructure; only provider opening/capture was tested — additional adapters may be needed before provider-wide execution.

Final: Ruling: no comparative speed, p50/p95 or memory improvement claim — synthetic metrics record observed run size/time only — actual throughput depends on the model and game engine.

Final: Ruling: OAuth discovery, PKCE, consent, token exchange and authenticated MCP are runtime-tested, without claiming an independent security audit — a functional implementation review is the scope — broader assurance would require separate work.

Final: Ruling: crash recovery preserves uncertain actions conservatively, without claiming restoration of an external provider session — journal recovery is tested; provider lifecycle restoration is not — interrupted paths can remain blocked for review.
