# Game Pilot MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un MCP que permita a ChatGPT observar y decidir por lotes sobre ocho demos, con BFS por juego y recorridos reproducibles.

**Architecture:** Coordinador Cloudflare con D1 y R2 privado, y cuatro ejecutores locales Playwright con dos sesiones independientes cada uno. El cliente MCP recibe imágenes juntas y devuelve decisiones por lote; la ejecución y los resultados son independientes por juego. Un diario persistente permite recuperar el trabajo sin repetir acciones de resultado incierto.

**Tech Stack:** JavaScript ESM, Node.js LTS compatible con las dependencias verificadas, Playwright, SDK oficial MCP, Cloudflare Workers/D1/R2, Wrangler; node:test y pruebas de navegador. Versiones exactas se fijan en lockfile después de comprobar documentación oficial y compatibilidad; no usar rangos sin lockfile.

**Spec:** [game-pilot-mcp-especificacion.md](game-pilot-mcp-especificacion.md), aprobada por el usuario el 2026-10-22. Este plan sigue pendiente de revisión.

## Global Constraints

- Cuatro procesos de navegador; dos contextos aislados por proceso; hasta ocho sesiones.
- Tres tiradas normales por juego por defecto; una ejecución de cada opción de compra distinta alcanzable con la configuración elegida y saldo ficticio.
- JPEG calidad 45, ancho máximo 960, proporción conservada; detalle selectivo cuando sea ilegible.
- Aceleración independiente por sesión: 1×→2×→4× sólo entre rondas tras tres transiciones verificadas por nivel. 8× requiere prueba explícita. Fallos deshabilitan aceleración y solicitan 1×; no repetir acciones inciertas.
- Hasta ocho observaciones por lote; ventana máxima de formación de 300 ms; una observación pendiente por sesión.
- Una sola acción que cambie el juego en curso por sesión; no secuencias largas de clics sin observar transiciones.
- BFS independiente, evidencia anterior/posterior y persistencia antes del clic.
- Resultado incierto nunca provoca repetición automática de compras o tiradas.
- Cloudflare coordina; Chromium corre en ejecutores locales persistentes en esta versión.
- No modificar los repositorios, bases, tokens o despliegues del Hybrid Fuzzer existente.
- No prometer inferencia autónoma permanente desde una conversación MCP, ni resultados aleatorios reproducibles.
- Repositorio privado propuesto Shisetsu-Code/game-pilot-mcp; confirmar que el nombre esté libre y utilizar exclusivamente la cuenta autorizada.

## Review Focus

1. Un lease vencido mientras llega una decisión: rechazarla sin emitir entrada; probar en tarea 2.
2. Iframe que cambia de tamaño o posición entre captura y clic: invalidar observación; probar en tarea 4.
3. Red que cae después de una compra: persistir incertidumbre y no reasignar el clic; probar en tareas 2 y 4.
4. Menú paginado, opción deshabilitada o bonus largo: cobertura parcial honesta y progreso independiente; probar en tareas 3 y 7.
5. Caída o cierre del cliente MCP: reentrega de observaciones tras lease y parada reconocida por ejecutores; probar en tareas 5 y 6.

## Estructura prevista

Dentro del nuevo repositorio:

- `src/contracts.js`: validación común y objetos serializables.
- `src/store.js`, `migrations/0001.sql`: persistencia D1, leases, diario, grafos y eventos.
- `src/graph.js`: BFS, opciones de compra y cobertura.
- `src/batches.js`: selección justa y reclamación por lotes.
- `src/mcp.js`, `src/worker.js`, `src/auth.js`: herramientas MCP, transporte remoto, rutas de ejecutores y autenticación.
- `runner/supervisor.mjs`, `runner/session.js`: cuatro procesos y ciclo independiente por juego.
- `runner/capture.js`, `runner/input.js`, `runner/adapters/`: observación, geometría y acciones.
- `runner/speed.js`: velocidad adaptativa, compatibilidad y registro por juego.
- `src/replay.js`, `runner/replay.js`: exportación y reproducción comprobada.
- `scripts/import-catalog.mjs`, `config/providers.json`: catálogo importado sin acoplarse a las colas antiguas.
- `test/`, `test/fixtures/demo/`: pruebas de contratos, persistencia y demo determinista.
- `docs/design.md`, `docs/operations.md`, `docs/client.md`: especificación aprobada, operación y conexión.
- `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `wrangler.jsonc`, `.gitignore`: configuración y CI sin credenciales.

Los nombres de funciones siguientes son contratos del plan. Sus objetos se validan en `src/contracts.js`; no se intercambian objetos Playwright por la red.

## Task 1: Contratos y base verificable

**Files:** `src/contracts.js`, `package.json`, `.gitignore`, `test/contracts.test.js`, `docs/design.md`.

**Interfaces:** `validateObservation(value) -> Observation`; `validateDecision(value) -> Decision`. Observation: `{sessionId,gameId,providerId,observationId,revision,capturedAt,frameId,geometry,imageRef,imageSha256,state,controls}`. Decision: `{commandId,sessionId,observationId,revision,leaseId,action,goal,target,reason}`. action incluye `type`, y sólo los campos aplicables `x,y,toX,toY,button,key,deltaX,deltaY`; coordenadas normalizadas finitas en [0,1].

- [ ] Crear pruebas que rechacen NaN, coordenadas fuera de rango, campos ausentes y tipos de acción desconocidos, y acepten clic, movimiento, arrastre, scroll y tecla válidos.
- [ ] Ejecutar `node --test test/contracts.test.js`; comprobar fallo por módulos aún ausentes.
- [ ] Verificar SDK MCP, Node, Playwright y Wrangler en documentación oficial; fijar versiones compatibles, scripts `check`, `test`, `test:browser` y contratos. Copiar diseño aprobado a `docs/design.md`.
- [ ] Ejecutar `npm run check` y prueba de contratos; ambos pasan.
- [ ] Commit local `chore: establish validated MCP game contracts`.

## Task 2: Diario durable y exclusión por sesión

**Files:** `src/store.js`, `migrations/0001.sql`, `test/store.test.js`.

**Interfaces:** `Store(db)` expone `claimSession(sessionId,owner,now,ttlMs)`, `saveObservation(observation)`, `queueDecision(decision,now)`, `claimCommand(sessionId,owner,now)`, `markIssued(commandId,owner,now)`, `finishCommand(commandId,result)`, `recover(now)`. Resultado por operación: `{ok,code,value}`. IDs se acotan por run y sesión; commandId es único en el run.

- [ ] Probar con SQLite/D1 real de entorno de pruebas: dos reclamantes tienen un único ganador; lease vencido y revisión antigua rechazan decisión; mismo commandId/mismo contenido devuelve resultado previo; mismo ID/contenido distinto da conflicto; caída tras `markIssued` recupera incierto, nunca encolado.
- [ ] Ejecutar prueba y comprobar fallos antes de implementación.
- [ ] Implementar tablas runs, sessions, observations, commands, graph_nodes, graph_edges, frontier, events. Usar operaciones SQL condicionales y transacciones soportadas por D1; no bloqueo en memoria como autoridad compartida. Cada escritura valida propietario y fencing de lease.
- [ ] Ejecutar prueba dos veces con base nueva, incluyendo reclamaciones concurrentes; pasa sin doble emisión.
- [ ] Commit `feat: persist session leases and command journal`.

## Task 3: BFS y cobertura por juego

**Files:** `src/graph.js`, `test/graph.test.js`.

**Interfaces:** `recordState(store,observation,semanticState) -> nodeId`; `recordTransition(store,{commandId,fromNodeId,toNodeId,result})`; `nextFrontier(store,sessionId) -> entry|null`; `getCoverage(store,sessionId) -> {purchases,normalSpins,blocked,uncertain,complete}`. semanticState: `{screen,visibleOptions,menuPage,roundPhase,geometrySignature,visualSignature}`; identidad principal semántica, no hash de píxeles solamente.

- [ ] Probar FIFO por profundidad, aislamiento de dos juegos, no duplicación por contador animado y distinción de páginas del menú. Assert que opción deshabilitada se registra, menú no agotado produce `complete:false`, y un bonus abierto impide otra compra en esa sesión.
- [ ] Ejecutar y comprobar fallo inicial.
- [ ] Implementar fronteras persistentes, opciones identificadas semánticamente y cierre de aristas sólo con resultado comprobado. Tres tiradas verificadas completan la cuota normal; no declarar comprada una opción por haber hecho clic.
- [ ] Ejecutar pruebas incluyendo reapertura de Store sobre la misma base; preserva frontera y cobertura.
- [ ] Commit `feat: track persistent per-game BFS coverage`.

## Task 4: Navegador, capturas e inputs comprobados

**Files:** `runner/session.js`, `runner/capture.js`, `runner/input.js`, `runner/adapters/base.js`, `test/input.test.js`, `test/capture.browser.test.js`, `test/fixtures/demo/`.

**Interfaces:** `captureObservation(page,context,{quality,maxWidth,detail}) -> {observation,imageBytes}`; `mapPoint(geometry,{x,y}) -> {x,y}`; `executeInput(page,decision,observation,journal) -> ActionResult`. journal expone Task 2 mediante cliente remoto. ActionResult: `{commandId,status,before,after,evidence,error}`, status `verified|uncertain|blocked`.

- [ ] Crear fixture con iframe desplazado, controles que cambian de posición, menú paginado y compra simulada. Probar que el centro normalizado se traduce al centro real, JPEG respeta ancho/proporción, una geometría cambiada impide clic y caída tras clic produce incierto sin segundo clic.
- [ ] Ejecutar pruebas y comprobar fallo inicial.
- [ ] Implementar recorte, reducción con biblioteca verificada, hash, geometría y validación justo antes de entrada. Persistir `issued` antes del input; si falla confirmar persistencia, no hacer clic. Registrar coordenadas normalizadas y de página, entrada y evidencia posterior. Usar espera por condición de estado; timeout afecta sólo esa sesión.
- [ ] Ejecutar pruebas de navegador y verificar imágenes de fixture; detalle selectivo permite leer controles pequeños.
- [ ] Commit `feat: capture compressed game views and execute checked inputs`.

## Task 4B: Aceleración adaptativa por juego

**Files:** `runner/speed.js`, `runner/session.js`, `test/speed.test.js`, `test/speed.browser.test.js`, `test/fixtures/demo/`.

**Interfaces:** `createSpeedController({sessionId,adapter,maxFactor:4}) -> SpeedController`; controlador expone `requestFactor(factor,observation)`, `recordTransition({verified,roundComplete,error,uncertain,elapsedRealMs})`, `status()` y `disable(reason)`. `status()` devuelve `{requestedFactor,effectiveFactor,method,compatible,verifiedTransitions,disabledReason}`. Adaptador expone `setAnimationSpeed(frame,factor)` y declara método `native|web-animation|validated-engine`; un motor sin compatibilidad declarada permanece a 1×.

- [ ] Crear pruebas: tras tres transiciones verificadas 1× se permite 2× únicamente fuera de ronda; tres más permiten 4×. Assert que fallo/timeout/incierto vuelve a 1×, no reintenta inputs y no afecta otra sesión. Rechazar 8× sin perfil explícitamente validado.
- [ ] Ejecutar `node --test test/speed.test.js`; comprobar fallo inicial.
- [ ] Implementar controlador, presupuesto por juego y eventos persistentes. Priorizar turbo nativo/Web Animations; no copiar el parche global `local/speed.js` del fuzzer. Temporizadores o relojes virtuales sólo mediante adaptador validado, con continuidad/monotonicidad al cambiar factor y sin alterar Date.now ni plazos de coordinación/red.
- [ ] Crear y ejecutar fixture de animación con reloj externo: comprobar menor espera real, una sola compra/ronda, orden de eventos igual, reloj externo intacto y fallback ante error introducido. Simular motor que no se recupera: bloquear sesión sin reload/recompra.
- [ ] Registrar en exportación perfil de velocidad, método, factor efectivo y cada cambio con motivo. Replay usa perfil compatible o 1×. Ejecutar pruebas de velocidad y navegador; ambas pasan.
- [ ] Commit `feat: adapt game animation speed with verified fallback`.

## Task 5: Lotes y MCP remoto

**Files:** `src/batches.js`, `src/mcp.js`, `src/worker.js`, `src/auth.js`, `test/batches.test.js`, `test/mcp.test.js`.

**Interfaces:** `claimObservations(store,{runId,reviewerId,limit,now}) -> Observation[]`; `submitDecisions(store,decisions,now) -> {commandId,ok,code}[]`; `createMcpServer(env)` registra todas las herramientas de la especificación. Rutas runner autenticadas: reclamar sesión/comando, renovar lease, subir observación y terminar comando. Tokens de ejecutor separados de acceso de cliente; no incluirlos en respuestas ni logs.

- [ ] Probar límite 8, una observación por sesión, reparto justo, ventana 300 ms con reloj controlado y devolución parcial aunque una sesión no responda. Probar lote de decisiones mixto: un elemento obsoleto no anula otros válidos. Probar reentrega tras lease y denegación de rutas sin autenticación.
- [ ] Ejecutar pruebas y comprobar fallo inicial.
- [ ] Implementar SDK oficial MCP con transporte remoto compatible verificado en documentación actual. Responder con bloques de texto identificadores junto a cada imagen; fijar límite de bytes tras medir fixture y devolver lotes parciales si se alcanza. Implementar herramientas de catálogo, ejecución, observaciones, decisiones, grafo, estado, control y replay usando contratos previos. Autenticación del cliente según compatibilidad comprobada; no declarar conexión ChatGPT funcional sin handshake real.
- [ ] Exponer `set_game_speed({sessionId,factor})`, devolver estado efectivo de Task 4B y probar que una solicitud no salta las condiciones de compatibilidad ni interrumpe una ronda.
- [ ] Ejecutar pruebas de herramientas con cliente SDK y almacenamiento local D1/R2; comprobar que dos reviewers no reclaman la misma observación vigente.
- [ ] Commit `feat: expose batched MCP observations and decisions`.

## Task 6: Supervisor 4×2 y recuperación

**Files:** `runner/supervisor.mjs`, `runner/cloud-client.js`, `test/supervisor.test.js`.

**Interfaces:** `startSupervisor({workers:4,gamesPerWorker:2,coordinatorUrl,runId}) -> Supervisor`; Supervisor expone `pause()`, `resume()`, `stop()`, `status()`. Proceso hijo aloja un Chromium y dos contextos; cada contexto mantiene su propio ciclo. El control remoto se reconoce por ejecutor y se refleja en estado del run.

- [ ] Probar máximo cuatro procesos y ocho contextos, exclusión por sesión, progreso de otros siete ante un juego lento, y ausencia de nuevas entradas tras reconocer pausa/stop. Probar caída del coordinador: no actuar sin lease renovado; comandos emitidos permanecen inciertos.
- [ ] Ejecutar y comprobar fallos iniciales.
- [ ] Implementar procesos hijos, heartbeat, cancelación y reconexión acotada. Nunca reciclar sesión tras una compra incierta como si estuviera virgen. Stop cierra sólo procesos de este supervisor. Arranque de helpers Windows sin ventanas visibles.
- [ ] Ejecutar prueba y smoke de ocho contextos con fixture; registrar memoria, sesiones máximas y latencia por sesión.
- [ ] Commit `feat: run four isolated two-game browser workers`.

## Task 7: Catálogos y exploración demo

**Files:** `scripts/import-catalog.mjs`, `config/providers.json`, `runner/adapters/`, `test/catalog.test.js`, `test/exploration.browser.test.js`.

**Interfaces:** `importCatalog({repository,commitSha}) -> {providers,games,source}`; `openDemo(page,game,config) -> {frame,demoEvidence}`; adaptador expone `inspect(frame) -> {state,controls,roundPhase}`. Si no hay controles verificables, la observación visual llega al cliente MCP para decidir; no simular un modelo visual mediante etiquetas heurísticas.

- [ ] Probar importación con SHA fijo y procedencia, rechazo de URLs no admitidas y detección de menú completo frente a paginado no recorrido. Probar varias compras simuladas, confirmaciones, bonus y tres rondas normales con cobertura final verificable.
- [ ] Ejecutar pruebas y comprobar fallos iniciales.
- [ ] Importar catálogo público de Hybrid-actions sin habilitar automáticamente sitios que no abran demos verificables. Implementar primer adaptador validado para un proveedor; usar fallback visual para el resto. Registrar compatibilidad observada, no cobertura universal. Utilizar la confirmación de mayoría de edad ya otorgada sólo cuando la demo lo solicite.
- [ ] Ejecutar fixture end-to-end y luego piloto de una demo real con herramientas MCP. No ampliar a ocho si no se puede verificar el resultado de las compras del piloto.
- [ ] Commit `feat: import demo catalogs and track purchase exploration`.

## Task 8: Exportación y replay

**Files:** `src/replay.js`, `runner/replay.js`, `test/replay.test.js`, `test/replay.browser.test.js`.

**Interfaces:** `exportReplay(store,runId) -> {manifest,events,graphs,imageRefs,coverage}`; `runReplay(page,bundle,{resolveTarget,observe,journal}) -> {status,steps}`. Manifiesto versionado incluye proveedor/juego, revisión de catálogo, configuración, versiones y precondiciones por paso.

- [ ] Probar exportación con eventos ordenados, coordenadas, hashes y evidencia; redacción de secretos; replay de fixture con viewport distinto mediante objetivo estable; divergencia detiene ruta; resultado aleatorio no exige el mismo premio.
- [ ] Ejecutar y comprobar fallo inicial.
- [ ] Implementar JSON + JSONL + referencias privadas a imágenes, sin URLs públicas permanentes. Replay vuelve a observar y comprueba precondiciones; no reproduce compras anteriores como simple navegación para volver a una rama.
- [ ] Ejecutar replay contra fixture, comparar secuencia de entradas y validar que un control desplazado no recibe clic incorrecto.
- [ ] Commit `feat: export auditable traces and checked replay`.

## Task 9: GitHub, despliegue y aceptación

**Files:** `.github/workflows/ci.yml`, `wrangler.jsonc`, `docs/operations.md`, `docs/client.md`, `README.md`, `scripts/verify-deployment.mjs`.

**Interfaces:** verificador devuelve códigos de salida distintos para fallo HTTP, autenticación, herramientas ausentes y almacenamiento no operativo; nunca imprime secretos.

- [ ] Añadir CI de sintaxis, pruebas D1 y navegador fixture. Ejecutar `npm run check`, `npm test`, `npm run test:browser`; conservar resultados y corregir fallos.
- [ ] Revisar código y dependencias; comprobar árbol Git sin credenciales ni trazas privadas. Verificar acceso GitHub y nombre disponible; crear repo privado autorizado y publicar commits. Si conector no puede crear repos, comprobar CLI autenticada antes de pedir intervención.
- [ ] Comprobar cuenta Cloudflare y acceso sin imprimir credenciales. Crear recursos nuevos exclusivos para este proyecto, aplicar migración nueva y desplegar. No reutilizar ni alterar recursos del fuzzer anterior. Si falta acceso, conservar código y CI completos y reportar el bloqueo preciso.
- [ ] Comprobar health, almacenamiento privado, autenticación y MCP `initialize`, `tools/list` y lote imagen/decisiones con cliente real; documentar conexión ChatGPT conforme a documentación oficial vigente. No sustituir este check por un HTTP 200.
- [ ] Ejecutar piloto 4×2 con demos compatibles tras piloto individual; medir bytes por imagen, tiempos p50/p95 captura→decisión→entrada, memoria y cobertura. Comparar con modo secuencial sobre fixture equivalente, sin repetir compras reales de demo para un benchmark innecesario.
- [ ] Exportar evidencia y replay de fixture. Documentar soporte verificado por proveedor, pendientes, comandos de inicio/stop, costos observados si disponibles y limitación de continuidad de ChatGPT. Informar repo/commit, checks y estado real del MCP.
- [ ] Commit `docs: publish verified setup and pilot evidence` y push final.

## Revisión del plan

Cobertura: contratos (1), persistencia/recuperación (2), BFS/compras (3), imagen/coordenadas (4), aceleración adaptativa (4B), lotes/MCP/autenticación (5), 4×2/control (6), catálogos/piloto (7), trazas/replay (8), CI/despliegue/cliente/evidencia (9). Los cinco riesgos de Review Focus tienen pruebas asignadas. Los contratos de funciones y objetos se mantienen iguales entre consumidores y productores.

La implementación no empieza hasta que el usuario revise este plan y elija ejecución en esta sesión o por subagentes, según la guía writing-plans. Recomendación: ejecución en esta sesión, porque las tareas comparten contratos de sesión/observación/diario y conviene comprobarlos de forma continua.
