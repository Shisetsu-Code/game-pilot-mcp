# Game Pilot MCP

MCP para explorar demos con saldo ficticio: **4 procesos Chromium × 2 juegos**, imágenes JPEG comprimidas por lotes, decisiones independientes, BFS persistente y exportación de recorridos.

Fuente publicada en el repositorio privado [Shisetsu-Code/game-pilot-mcp](https://github.com/Shisetsu-Code/game-pilot-mcp). Verificación: 24 pruebas de núcleo/OAuth y nueve de navegador. MCP desplegado: **https://game-pilot-mcp.braian-n-l.workers.dev/mcp**. [Comprobación remota](docs/deployment-evidence.json): autorización OAuth/PKCE, 21 herramientas e imágenes privadas verificadas. La conexión desde la cuenta de ChatGPT aún requiere añadir este MCP.

Los navegadores pueden ejecutarse enteramente en GitHub: abrir [Cloud game browsers](https://github.com/Shisetsu-Code/game-pilot-mcp/actions/workflows/browsers.yml), pulsar **Run workflow** y elegir una duración (30 minutos por defecto, máximo 300). Dejar `run_id` vacío para esperar tandas nuevas creadas desde MCP. Arranca cuatro procesos con dos juegos cada uno en un runner de GitHub; la PC del usuario puede estar apagada. El secreto de ejecutor está configurado como GitHub Actions secret. Cloudflare coordina y guarda el historial. Se puede detener desde **Cancel workflow**; no hay reinicio automático ni servicio permanente. Consume minutos de GitHub Actions.

En la autorización de ChatGPT usar la clave privada de `data/connection-key.txt`; no compartirla ni subirla a GitHub. Los iniciadores PowerShell son una alternativa local opcional.

## Qué está implementado

- MCP oficial con Streamable HTTP, puente stdio y OAuth 2.1 mediante la biblioteca de Cloudflare.
- Lotes de hasta ocho capturas, JPEG calidad 45 y ancho máximo 960. Las sesiones listas no esperan al juego más lento. El lote sale inmediatamente; no añade la ventana opcional de 300 ms.
- Inputs de mouse, arrastre, scroll y teclas permitidas; coordenadas normalizadas y conversión al viewport/iframe actual. Comprobación del control o del área visual antes del clic.
- Una acción en curso por sesión, leases y diario durable antes del input. Un resultado incierto nunca se repite automáticamente.
- Los timeouts de captura mantienen abierta la sesión: se reintenta la imagen con espera gradual y heartbeat activo. Mientras la pantalla siga sin clasificar, cargando o con ronda activa, se renueva automáticamente cada cinco segundos cuando no hay una revisión reservada ni un input pendiente. Un cambio de objetivo visual pide otra observación; no repite el clic. Los errores definitivos de documento, como 404/410/401/403, se registran y bloquean la sesión; un 404 de un recurso accesorio no la termina. También se respetan pausa, parada y el tiempo de ejecución configurado en GitHub.
- Árbol/grafo BFS independiente por juego, frontera persistente, opciones de compra, tres tiradas normales por defecto y cobertura explícita. El modelo clasifica las pantallas y elige caminos; no se atribuye análisis visual a una heurística de texto.
- Separación entre entrada emitida, pantalla observada y resultado verificado por el revisor.
- Aceleración adaptativa 1×/2×/4× para animaciones Web Animations accesibles, tras rondas verificadas y fuera de ronda. No parchea todos los timers ni acelera red, respuestas del proveedor o análisis de ChatGPT. Motores canvas sin ese soporte siguen a 1×.
- Exportación privada JSON/JSONL con acciones, estados, imágenes referenciadas y BFS. Replay con comprobación de estado/objetivo y revisión entre pasos.
- Catálogo importado de **24 proveedores y 4.415 juegos**, fijado a la revisión `1014816f2952a9019369ddde5c0ad55c40e33d78` de Hybrid-actions. Las entradas requieren aprobación de uso demo; importarlas no prueba compatibilidad.

## Empezar en Windows

### Lanzador de links (navegadores en GitHub)

Abrir **`Abrir-Lanzador.cmd`** con doble clic. Pegar un link HTTPS por línea, elegir la duración y pulsar **Enviar y ejecutar en GitHub**. Requiere Node y la sesión de GitHub CLI de esta PC; no requiere instalar Chromium localmente. El lanzador sólo muestra el formulario y publica la lista; los juegos se abren en GitHub.

Cada envío guarda `queues/UUID.json` en el repositorio privado y dispara `browsers.yml`. El workflow carga la lista en Cloudflare y obtiene un run ID; cuatro workers toman hasta dos juegos cada uno. Hasta 64 links por tanda, sin duplicados. Las tandas de GitHub se ejecutan una por vez. Si una ya está activa, la siguiente espera.

En ChatGPT: **«Usá list_runs y procesá mi nueva tanda por lotes»**. El MCP debe estar conectado; el lanzador no crea inferencia autónoma. Se puede cerrar el formulario o apagar la PC después del envío. El seguimiento está en Actions y `get_run_status`. Los links se conservan completos en el repositorio privado: los accesos temporales pueden vencer y las URLs con credenciales incrustadas se rechazan.

Para salir por tu VPN, activar **Usar WireGuard para esta tanda** y seleccionar el archivo `.conf` desde el mismo formulario. El lanzador valida el perfil y lo envía mediante stdin a GitHub Actions Secrets; el repositorio guarda sólo su referencia. Cada perfil normalizado tiene un nombre independiente, reutilizable, para que otra subida no cambie tandas en espera. No se copia el archivo a la carpeta del proyecto ni se muestra su contenido. Si usás el mismo perfil al mismo tiempo en otro equipo, el servidor puede cambiar el destino del peer: usar un perfil dedicado a GitHub.

Se admiten perfiles de cliente estándar con una interfaz, un peer, Address IPv4, DNS por IP y `AllowedIPs` que incluya `0.0.0.0/0`. Las rutas IPv6 pueden ir por el túnel si el perfil las incluye; la salida IPv6 directa queda bloqueada. No se aceptan scripts PreUp/PostUp/PreDown/PostDown, Table, SaveConfig ni extensiones de proveedores. Una configuración incompatible se rechaza antes de publicar la tanda. El workflow verifica ruta, handshake y salida HTTPS antes de abrir juegos, instala bloqueo de salida directa IPv4/IPv6 y limpia el perfil temporal al terminar. Todo el tráfico del job, incluido el MCP, pasa por la VPN; el servidor debe permitir acceso a GitHub, Cloudflare y los juegos.

Los perfiles se conservan como secretos `WG_CONFIG_<huella>` hasta que el propietario los elimine desde Settings → Secrets and variables → Actions. No eliminarlos mientras haya tandas que los usen. No hay borrado automático ni renovación de credenciales. La conexión con tu servidor sólo puede comprobarse al enviar tu configuración real.

Si se guardó la lista pero falló el inicio de Actions, el lanzador lo indica: iniciar manualmente el workflow con el `queue_path` mostrado, sin volver a crear una tanda. La carga de una misma lista es idempotente; un error intermedio al crear la tanda se bloquea para revisión y no repite compras.

### Alternativa: todo local

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

## Capacidad ampliada sin VPN

El lanzador sin VPN usa `distributed-browsers.yml`: cuatro máquinas de GitHub, hasta ocho navegadores independientes por máquina (32 juegos abiertos). El coordinador conserva el límite por owner con CAS; `set_worker_capacity` admite 1–8 y no reinicia sesiones. Los cupos sin trabajo no abren Chromium. Con menos de 1 GiB libre se demora la admisión de nuevos juegos, conservando los abiertos. Estado y comando llegan en una consulta `/runner/poll`. Las tandas con WireGuard mantienen el flujo protegido anterior.

Medición GitHub (2 CPU, 7,75 GiB), con canvas animados y pausas de 2 segundos: 2/4/6/8 juegos produjeron 0,93/1,73/2,33/2,60 operaciones por segundo. Son pruebas sintéticas; la capacidad con proveedores reales depende de cada juego y de la red. Ver `docs/capacity-idle-evidence.json`.
