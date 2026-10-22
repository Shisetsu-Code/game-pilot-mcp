# Game Pilot MCP

MCP para explorar demos con saldo ficticio: **4 procesos Chromium × 2 juegos**, imágenes JPEG comprimidas por lotes, decisiones independientes, BFS persistente y exportación de recorridos.

## Qué está implementado

- MCP oficial con Streamable HTTP, puente stdio y OAuth 2.1 mediante la biblioteca de Cloudflare.
- Lotes de hasta ocho capturas, JPEG calidad 45 y ancho máximo 960. Las sesiones listas no esperan al juego más lento. El lote sale inmediatamente; no añade la ventana opcional de 300 ms.
- Inputs de mouse, arrastre, scroll y teclas permitidas; coordenadas normalizadas y conversión al viewport/iframe actual. Comprobación del control o del área visual antes del clic.
- Una acción en curso por sesión, leases y diario durable antes del input. Un resultado incierto nunca se repite automáticamente.
- Árbol/grafo BFS independiente por juego, frontera persistente, opciones de compra, tres tiradas normales por defecto y cobertura explícita. El modelo clasifica las pantallas y elige caminos; no se atribuye análisis visual a una heurística de texto.
- Separación entre entrada emitida, pantalla observada y resultado verificado por el revisor.
- Aceleración adaptativa 1×/2×/4× para animaciones Web Animations accesibles, tras rondas verificadas y fuera de ronda. No parchea todos los timers ni acelera red, respuestas del proveedor o análisis de ChatGPT. Motores canvas sin ese soporte siguen a 1×.
- Exportación privada JSON/JSONL con acciones, estados, imágenes referenciadas y BFS. Replay con comprobación de estado/objetivo y revisión entre pasos.
- Catálogo importado de **24 proveedores y 4.415 juegos**, fijado a la revisión `1014816f2952a9019369ddde5c0ad55c40e33d78` de Hybrid-actions. Las entradas requieren aprobación de uso demo; importarlas no prueba compatibilidad.

## Empezar en Windows

Requiere Node.js 22.16+ y acceso a los paquetes oficiales.

```powershell
npm ci
npx playwright install chromium
node scripts/init-local.mjs
.\Start-Game-Pilot.ps1
```

El iniciador abre el coordinador local y cuatro ejecutores ocultos. Mantener su terminal activa; Ctrl+C detiene esta ejecución. La configuración privada del cliente MCP se genera en `data/mcp-config.json`. No compartir ese archivo ni `.env`: contienen credenciales locales. El repositorio los excluye.

El coordinador local escucha sólo en `127.0.0.1:4176`. Para ChatGPT web se necesita el despliegue HTTPS y OAuth descrito en [operación](docs/operations.md); una URL localhost o un archivo stdio no constituye una conexión remota de ChatGPT.

## Uso por lotes

1. `list_providers` y `list_games` permiten seleccionar juegos. `approve_demo` guarda la evidencia de que la entrada elegida corresponde a una demo ficticia autorizada.
2. `start_run` crea hasta 64 juegos en cola; los ejecutores mantienen hasta ocho abiertos a la vez. Los ejecutores arrancados sin `PILOT_RUN_ID` descubren tandas nuevas automáticamente.
3. `get_observations` devuelve hasta ocho imágenes con identificadores. Clasificar cada pantalla mediante `annotate_observations`, incluyendo `roundPhase: idle|active|unknown`.
4. `submit_decisions` envía un input por sesión en un lote. Después del clic, otra observación permite `review_results` por lote. Una imagen por sí sola no confirma que una compra o bonus haya terminado.
5. Si hay animación o bonus activo, pedir nuevas observaciones. Marcar resultados sólo cuando la evidencia permita comprobarlos. Los demás juegos continúan.
6. `update_coverage` registra opciones, páginas agotadas y nodos expandidos. `complete_game` comprueba compras registradas y tres tiradas; libera el puesto para otro juego.
7. `export_replay` guarda manifiesto y eventos privados. `start_replay`, seguido de observación/clasificación y `advance_replay`, ejecuta pasos comprobados; los controles visuales sin objetivo estructurado único requieren revisión y decisión nuevas.

Ver [guía del cliente](docs/client.md) para contratos y criterios de revisión.

## Verificación

```powershell
npm run check
npm test
npm run test:browser
npx wrangler deploy --dry-run --outdir artifacts/worker
```

Las pruebas de navegador incluyen un sistema completo con cuatro procesos, ocho demos deterministas, dos compras y tres tiradas por juego, imágenes reales y herramientas MCP reales. [Evidencia del piloto sintético](docs/pilot-evidence.json). Es una validación de infraestructura; no es un benchmark de inferencia visual ni una certificación de los 24 proveedores.

## Límites actuales

- Los resultados aleatorios del proveedor no son reproducibles; sí se registra la secuencia de entradas y sus condiciones.
- El BFS guía al revisor; no restaura automáticamente estados que requieren repetir compras. Un camino que no se puede reconstruir se informa bloqueado.
- La persistencia usa un documento CAS por sesión, con límite explícito de 850 KB. Al alcanzar capacidad se detiene esa sesión; exportar y dividir el trabajo. No hay purga silenciosa del historial.
- Los adaptadores de lanzamiento no equivalen a soporte universal. Pragmatic tiene manejo inicial del botón Play Demo; los demás pueden necesitar navegación revisada o un adaptador específico. Nunca afirmar cobertura completa de un menú no recorrido.
- Acelerar animaciones accesibles no acelera necesariamente un motor canvas. Cambiar a 1× no garantiza recuperar un motor que ya falló; conservar evidencia y bloquearlo si no se recupera.
- Un chat MCP analiza lotes durante sus turnos. No crea ocho inferencias autónomas permanentes ni continúa después de terminar el turno. Eso requeriría un servicio por API con presupuesto aparte.
- GitHub y Cloudflare requieren acceso autenticado. El código y el empaquetado local no prueban que exista un repositorio remoto o un despliegue activo.

## Procedencia

Proyecto independiente. Catálogos de [Hybrid-actions](https://github.com/Shisetsu-Code/Hybrid-actions) y referencia de diseño de [hybrid-cloud-fuzzer](https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer). No se modifica su despliegue ni se comparten sus secretos o colas.
