# Implementation ledger

Plan: ../game-pilot-mcp-plan.md. Specification approved; user authorized continuous implementation in this session.

Ruling: new isolated repository under outputs/game-pilot-mcp on implementation branch; no worktree of an unrelated repository — avoids changing existing projects — no shared checkout baseline exists.

Ruling: D1 stores one versioned CAS document per session rather than seven relational tables — makes lease/observation/graph/command transitions atomic in one conditional SQL update and directly testable with SQLite — each session has an explicit 850 KB capacity; larger runs must export and start new sessions until normalized archival is added.

Access preflight: first sandboxed gh check reported invalid authentication. Network-authorized verification proved gh is authenticated as Shisetsu-Code; the first report was a network sandbox false negative. Private empty remote https://github.com/Shisetsu-Code/game-pilot-mcp created successfully. Wrangler remains unauthenticated.

Tasks 1–8 and 4B: implemented with tests observed failing before implementation. Before final review, 19 unit/runtime tests and 7 browser tests passed, including four Chromium processes/eight contexts, 56 actions and private exports. Cloudflare deployment dry-run passed. One official CandyRush DEMO frame was opened/captured successfully with no purchases/spins.

Task 9: source published privately at https://github.com/Shisetsu-Code/game-pilot-mcp, main commit 556a9e753402cbd074f7572d0797d37b673464cc. GitHub verification https://github.com/Shisetsu-Code/game-pilot-mcp/actions/runs/39836492865 completed successfully. Cloudflare production deployment and real ChatGPT connection require authentication. No production endpoint is claimed.

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

Final verification after the fix pass: syntax checks pass; 24/24 unit/runtime tests pass; 9/9 browser tests pass (including full 4×2 processes); deployment dry-run passes. The same checks passed in GitHub CI on Ubuntu/Node24. The reviewer was not re-dispatched; each Important finding was covered by its red-to-green regression test and the full green suite.

Final: minor (deferred): historical design/plan documents preserve earlier proposal status and unchecked execution steps; current implementation and acceptance status are in README and this ledger.

Final: Ruling: production deployment and real ChatGPT connection remain unverified until Cloudflare authentication — no available authenticated deployment account — cannot call the remote MCP active yet.

Final: Ruling: real-provider purchase/bonus acceptance is not inferred from the read-only CandyRush probe — synthetic workflows verify infrastructure; only provider opening/capture was tested — additional adapters may be needed before provider-wide execution.

Final: Ruling: no comparative speed, p50/p95 or memory improvement claim — synthetic metrics record observed run size/time only — actual throughput depends on the model and game engine.

Final: Ruling: OAuth discovery, PKCE, consent, token exchange and authenticated MCP are runtime-tested, without claiming an independent security audit — a functional implementation review is the scope — broader assurance would require separate work.

Final: Ruling: crash recovery preserves uncertain actions conservatively, without claiming restoration of an external provider session — journal recovery is tested; provider lifecycle restoration is not — interrupted paths can remain blocked for review.

Deployment update 2026-10-22: the existing encrypted Wrangler session works with project-local Wrangler 4.152.0. Created isolated D1/R2/KV, installed migration and three independent secrets, then deployed version 75bbd34d-d509-4a8d-a0e5-6bdaad553429 to https://game-pilot-mcp.braian-n-l.workers.dev. This supersedes earlier authentication/deployment blockers above. Live checks passed: health/schema, bearer MCP and 21 tools, private JPEG write/read with anonymous denial, OAuth discovery/consent/PKCE/token exchange and OAuth-authenticated MCP. Evidence: deployment-evidence.json. Official SDK verifier also passed. ChatGPT account connection and real-provider purchase acceptance remain unverified. Added a remote runner launcher; it does not imply executors are currently running.

Launcher update 2026-10-22: added a Windows launcher (Abrir-Lanzador.cmd / Open-Game-Launcher.ps1), loopback form, GitHub Contents publication under queues/UUID.json and manual workflow dispatch. Four GitHub browser processes consume two sessions each. The GitHub workflow imports the selected manifest into the authenticated /v1/launch endpoint; repeated imports return the same run, conflicting contents are rejected and interrupted creation is blocked rather than replayed. Custom demo games retain URL snapshots for export/replay. list_runs discovers active launcher submissions. Dedicated GitHub Actions MCP import secret configured privately. Runtime deployed version 0e828cfe-95f0-4f8b-a43e-925c9a988104; SDK verifier sees 22 tools. 29 core/runtime/launcher tests and 9 browser tests passed. Live form published queue 9fb28cca-7fb0-452c-bd1c-30538163571e and dispatched Actions 39841562537; the real importer returned the same Cloudflare run 91fc3548-8f97-4c81-ab8e-eb074e7b66c1 on two calls. Browser startup in Actions is still being verified; no provider purchase/spin acceptance is inferred from this launcher test.
