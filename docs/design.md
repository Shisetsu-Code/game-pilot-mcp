# Game Pilot MCP — especificación para revisión

Fecha: 2026-10-22. Estado: diseño propuesto; no implementado ni desplegado.
Repositorio propuesto: Shisetsu-Code/game-pilot-mcp, privado.

## Objetivo y alcance

Controlar demos con dinero ficticio mediante un MCP conectado a ChatGPT. Ejecutar cuatro procesos de navegador, con dos juegos simultáneos por proceso, hasta ocho sesiones independientes. Explorar las opciones de compra disponibles, completar las secuencias de cada opción y ejecutar por defecto tres tiradas normales por juego. Guardar evidencia y recorridos reproducibles.

El usuario confirmó ser adulto y contar con permiso de la plataforma. Se usarán los catálogos existentes como insumo; su presencia en un catálogo no demuestra compatibilidad del juego ni disponibilidad actual de la demo. No se usarán cuentas de pago ni compras con dinero real.

Se interpreta «bsf» como BFS, búsqueda en anchura, independiente por juego.

## Arquitectura

1. Un coordinador remoto en Cloudflare expone MCP, administra sesiones, observaciones, decisiones, cola y registro persistente. Diseño de almacenamiento: D1 para trabajos/grafos/acciones; R2 privado para imágenes y trazas. Selección final de primitivas de exclusión y límites tras validar documentación actual.
2. Cuatro ejecutores con Chromium/Playwright alojan dos contextos aislados cada uno. Cloudflare coordina; no se presupone que un Worker estándar pueda alojar Chromium. El primer despliegue usará ejecutores locales persistentes para permitir interacción continua. GitHub Actions será una alternativa de ejecución acotada, no una conexión permanente.
3. ChatGPT solicita un lote de observaciones y devuelve un lote de decisiones. El servidor distribuye acciones a las sesiones correspondientes; sus resultados llegan independientemente.
4. El repositorio anterior permanece como referencia. Se importará el catálogo mediante una operación explícita y una revisión fija; no se modifica ni se comparte su cola de ejecución.

## Paralelismo real y límites del cliente

El MCP tendrá herramientas por lotes; no exigirá ocho llamadas sucesivas para observar o actuar. Las observaciones incluirán hasta ocho juegos distintos en una respuesta, con un identificador inequívoco antes de cada imagen. Una decisión puede contener acciones para cualquiera de esos juegos; no es obligatorio completar el lote entero.

Los ocho navegadores podrán capturar, actuar y esperar animaciones en paralelo. Dentro de una sesión habrá una sola acción que cambie el juego en curso. No se esperan dos comandos simultáneos sobre el mismo juego.

Una única conversación de ChatGPT puede razonar sobre un lote de imágenes y enviar decisiones juntas. Esto no garantiza ocho inferencias de modelos independientes ni que ChatGPT continúe trabajando después de finalizar su turno. Si se requiere análisis autónomo permanente y ocho inferencias concurrentes, hará falta un servicio de modelos por API con credenciales y presupuesto separados. Ese servicio es una extensión; la versión inicial no lo afirmará como disponible.

El lote se formará con los juegos listos, con ventana máxima propuesta de 300 ms, sin esperar al juego más lento. Se limitará a una observación pendiente por sesión y habrá reparto justo entre juegos. Los límites reales del cliente MCP y el tamaño total de respuesta deberán validarse antes del piloto.

## Imágenes y observaciones

- Capturar únicamente el área visible del juego, manteniendo la geometría de su iframe.
- Perfil inicial configurable: JPEG, calidad 45, ancho máximo 960 píxeles y conservación de proporción. Estos valores son una hipótesis de rendimiento, no una calidad ya validada.
- Si un control resulta ilegible, solicitar recorte o imagen de mayor calidad sólo para esa sesión. No se inferirán botones a partir de texto ilegible.
- Cada observación incluye sessionId, gameId, providerId, observationId, revision, capturedAt, dimensiones originales y comprimidas, rectángulo de captura, viewport, contexto del iframe y transformación entre imagen y página.
- La imagen enviada tendrá hash y referencia a su archivo. Se conservará la imagen efectivamente analizada para auditar las coordenadas.
- Reutilizar controles estructurados cuando sean verificables. Comparaciones visuales pueden ahorrar capturas idénticas, pero no bastan para declarar que una compra tuvo éxito.

## Aceleración adaptativa de animaciones

Reducir tiempos muertos por juego con un controlador independiente: comenzar en 1×, probar 2× y luego 4×. 8× queda como prueba explícita para juegos ya validados; no es el valor por defecto. La compatibilidad se registra por proveedor, juego y versión del adaptador; no se extrapola a todo un proveedor.

Priorizar las opciones nativas de turbo y animaciones accesibles mediante Web Animations. La aceleración de temporizadores o del reloj de un motor requiere un adaptador validado, ya que puede alterar lógica además de animaciones. No aplicar indiscriminadamente un parche global de timers, ni modificar Date.now, vencimientos de sesión, relojes del coordinador, red o ritmos de apertura por proveedor. Cambios de factor sobre relojes virtuales deben conservar continuidad y monotonicidad.

Subir de factor sólo entre rondas, después de tres transiciones verificadas consecutivas al factor actual y cuando la espera sea atribuible a animación. Medir tiempo real con reloj del ejecutor. No confundir ausencia de excepciones con éxito: comprobar fin de ronda/bonus, estado esperado y controles disponibles. Duplicación de acciones, errores nuevos, estado incoherente, timeout de transición o resultado incierto hacen volver a 1× y deshabilitan aceleración para esa sesión hasta revisión. Volver a 1× no garantiza reparar un motor ya alterado: si el estado no se recupera, bloquear la sesión conservando evidencia; no recargar y repetir una compra.

Registrar cada cambio: factor solicitado y efectivo, método, observación, motivo, tiempos y resultado. El replay restaura el perfil sólo si sigue siendo compatible; en caso contrario usa 1×. La aceleración no reduce latencia de red ni permite enviar otra compra o tirada antes de verificar la anterior.

## Herramientas MCP propuestas

- list_providers / list_games: catálogo y compatibilidad observada, sin inventar cobertura.
- start_run: selección de demos, cuatro ejecutores, dos juegos por ejecutor, límites y tres tiradas normales por defecto.
- get_observations: reclamar hasta ocho observaciones disponibles con sus imágenes.
- submit_decisions: validar y encolar decisiones de varios juegos en una sola llamada; devolver aceptación o error por elemento.
- get_run_status / get_game_graph: progreso global y BFS de cada juego.
- request_observation: nueva captura o detalle de una sesión.
- set_game_speed: solicitar perfil de velocidad por sesión y devolver factor efectivo, método y compatibilidad; puede rechazar factores no validados.
- pause_run / resume_run / stop_run: control con reconocimiento de los ejecutores.
- export_replay / start_replay: exportación versionada y reproducción verificada.

Las acciones permitidas incluyen mover el puntero, clic, arrastre, scroll y teclas necesarias para la interfaz. Cada acción indica propósito, objetivo y observación de origen. Las compras y tiradas se expresan además semánticamente para medir cobertura y comprobar resultados.

No se enviarán largas listas de clics a ciegas. Cada transición que pueda cambiar posiciones o estado requerirá una nueva observación; los otros juegos continúan mientras tanto.

## BFS por juego

Persistir un grafo de estados de interfaz y una frontera FIFO por juego. La identidad de un nodo usa estado semántico, opciones visibles, marco/viewport y firma de imagen; excluir contadores animados de la comparación cuando sea posible. No identificar nodos sólo por hash de píxeles.

Estados de trabajo: pendiente, observado, esperando_decisión, ejecutando, esperando_resultado, completado, bloqueado e incierto. Aristas: acción propuesta, emitida, resultado verificado o resultado incierto. La frontera se actualiza después de guardar evidencia de la transición.

Explorar por capas: pantalla base, menú de compras, opciones, confirmaciones y secuencias posteriores. Registrar cada opción de compra visible una vez por configuración elegida. El espacio de apuestas e importes puede ser ilimitado; la versión inicial usa el importe actual o mínimo disponible y no promete agotar todas las combinaciones.

Registrar páginas o scroll del menú, opciones deshabilitadas y opciones no disponibles. «Todas las compras» significa todas las opciones distintas alcanzables bajo esos límites, no repetir compras indefinidamente. Si no se puede verificar que el menú se recorrió entero, reportar cobertura parcial.

Las tiradas tienen resultados aleatorios: se registra la transición y se espera el fin de la ronda, sin intentar enumerar todos los premios posibles. Un bonus no puede cortarse para comenzar otra compra. Si no se identifica su final, bloquear únicamente ese camino.

Al volver a una rama anterior, reconstruir la navegación desde un estado comprobado. No reproducir automáticamente una compra previa para regresar a una pantalla. Una rama que no pueda restablecerse se registra como bloqueada.

## Coordenadas, trazas y reproducción

Por acción guardar: runId, sesión, proveedor, juego, ejecutor, secuencia, commandId, observationId/revision, nodo y arista BFS, timestamps, objetivo, motivo, tipo de entrada, botón, teclas, coordenadas normalizadas en la imagen y coordenadas calculadas en la página, transformación, viewport, frame, referencias de evidencia anterior/posterior, controles estructurados y resultado.

Guardar también catálogo/revisión importada, versión del ejecutor/adaptador, perfil de captura, configuración, URL demo sin secretos, contexto de idioma/dispositivo y esperas por condición. Los diagnósticos de red excluirán credenciales, cookies y tokens.

Exportación: manifiesto JSON versionado, eventos JSONL, grafo, imágenes referenciadas y reporte de cobertura. Cada ruta de replay tendrá precondiciones, pasos y condiciones de éxito.

En replay, primero comprobar pantalla y resolver el objetivo en la geometría actual. Preferir controles estables cuando existan y usar coordenadas registradas sólo con alineación y estado verificados. Una diferencia detiene esa ruta y pide revisión. Se puede reproducir una secuencia de entradas; no se garantiza reproducir premios ni resultados aleatorios.

## Consistencia y recuperación

Persistir el comando antes de emitir el clic. Validar lease, propietario, revisión y vigencia de observación. Rechazar coordenadas fuera de rango, sesiones equivocadas y decisiones sobre pantallas reemplazadas.

Deduplicar commandId para no reenviar comandos ya registrados. No prometer ejecución exactamente una vez: un navegador puede fallar después del clic y antes de confirmar el resultado. Esos casos pasan a incierto y requieren reconciliación mediante nueva evidencia, sin repetir automáticamente compras o tiradas.

Errores y timeouts se gestionan por juego. Los demás continúan. Reinicios recuperan la cola y el grafo, pero no presuponen que sobreviva una sesión efímera del proveedor. Stop impide nuevas acciones; no puede deshacer un clic ya emitido.

## Validación y piloto

Pruebas necesarias: límite 4×2 y exclusión por sesión; lotes parciales sin bloqueo por juego lento; mapeo de coordenadas con escalado/iframe; rechazo de observaciones antiguas; deduplicación; caída tras clic con resultado incierto; persistencia y reanudación BFS; aislamiento entre juegos y comprobación de replay. Aceleración: escalada sólo entre rondas verificadas, retroceso a 1× ante fallo, aislamiento de clocks externos, continuidad de clocks virtuales y ausencia de clics duplicados.

Usar primero una interfaz de prueba determinista con menú de varias compras y rondas simuladas. Luego una demo real verificada; ampliar a ocho sesiones sólo tras comprobar evidencias. Medir tamaño de imágenes, latencia captura→decisión→acción, uso de memoria, throughput y cobertura. No afirmar mejora de velocidad sin comparación medida.

## Pendientes de ejecución

Esta especificación requiere revisión del usuario antes de elaborar el plan de implementación, según la guía de diseño aplicada. Aún no se creó el repositorio, no se implementó el MCP y no se validó un despliegue. La disponibilidad de acceso para crear repositorios, publicar en Cloudflare y conectar el cliente se comprobará durante la implementación; no se asumirán credenciales existentes.
