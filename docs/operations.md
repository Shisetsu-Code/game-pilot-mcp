# Operación y publicación

## Estado de acceso inicial

El repositorio privado está publicado y el MCP está desplegado en https://game-pilot-mcp.braian-n-l.workers.dev/mcp. Se reutilizó la sesión existente de Wrangler al actualizar la dependencia del proyecto a 4.152.0, compatible con su configuración cifrada. No fue necesario iniciar otra sesión ni copiar credenciales del fuzzer. Recursos nuevos: D1 `game-pilot`, R2 privado `game-pilot-private` y KV `game-pilot-mcp-oauth`.

La evidencia de `deployment-evidence.json` corresponde a una comprobación histórica, no necesariamente al último despliegue. Consultar Cloudflare y el historial de publicación para identificar la versión activa. Ya se realizaron compras demo y verificaciones visuales parciales; eso no prueba compatibilidad universal ni una conexión funcional desde cualquier chat. Ver el [README](../README.md) y [Navegación y clasificación](vision-loop.md) para el estado y flujo actuales.

## GitHub

El repositorio ya existe y tiene `main` como rama principal. Para obtenerlo en otra carpeta o equipo:

```powershell
gh repo clone Shisetsu-Code/game-pilot-mcp
```

La copia local actual ya tiene `origin` configurado. No crear otro repositorio del mismo nombre. No incluir `.env`, `data`, `artifacts` ni `node_modules`.

## Cloudflare

Los recursos siguientes ya están creados y vinculados en `wrangler.jsonc`. Los comandos de creación son referencia para otra instalación; no repetirlos en esta cuenta:

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler d1 create game-pilot
npx wrangler r2 bucket create game-pilot-private
npx wrangler kv namespace create OAUTH_KV
```

Copiar los identificadores nuevos a `wrangler.jsonc`. Configurar `OAUTH_ISSUER` con el origen HTTPS definitivo. Nunca sustituir identificadores del Hybrid Fuzzer.

```powershell
npx wrangler d1 migrations apply game-pilot --remote
npx wrangler secret put MCP_TOKEN
npx wrangler secret put RUNNER_TOKEN
npx wrangler secret put OAUTH_LOGIN_SECRET
npx wrangler deploy --dry-run --outdir artifacts/worker
npm run deploy
```

Usar tres valores distintos de al menos 32 caracteres, generados localmente. Introducirlos en los prompts privados; no colocarlos en argumentos, logs o Git. `MCP_TOKEN` es para clientes técnicos/puente y verificador, `RUNNER_TOKEN` para ejecutores y `OAUTH_LOGIN_SECRET` para autorizar la conexión interactiva de ChatGPT.

El bucket R2 permanece privado. OAuth guarda clientes/grants en el KV nuevo. `global_fetch_strictly_public` protege las recuperaciones de metadatos de cliente de la biblioteca OAuth.

Configurar en el entorno local de ejecutores `PILOT_URL` al origen HTTPS y `PILOT_RUNNER_TOKEN` al secreto remoto correspondiente; ejecutar `npm run runner`. No poner el secreto OAuth ni el MCP en los ejecutores remotos si no los necesitan. Los cuatro procesos pueden descubrir tandas sin un run ID fijo.

El lanzador selecciona el workflow según la tanda:

- **Sin VPN:** `distributed-browsers.yml`, con cuatro máquinas y entre uno y ocho navegadores por worker. El lanzador solicita ocho: hasta 32 juegos simultáneos. Admite `queue_path` para una lista nueva o `existing_run_id` para admitir pendientes de una tanda existente; no recupera un navegador cerrado ni repite una acción incierta. Duración predeterminada del workflow: 300 minutos.
- **Con WireGuard:** `browsers.yml`, con un job y cuatro procesos, dos juegos por proceso por defecto. Recibe `queue_path` y la referencia `wireguard_secret`. Duración predeterminada: 30 minutos.

Ambos aceptan entre 1 y 300 minutos. Sus grupos de concurrencia están asociados a la tanda; ejecuciones de distintas tandas pueden coexistir y consumir recursos adicionales. No hay programación ni reactivación automática. Los jobs de preparación/carga usan `PILOT_MCP_TOKEN`; los navegadores usan `PILOT_RUNNER_TOKEN`. No necesitan la clave de consentimiento OAuth. Para detenerlos usar Cancel workflow y revisar cualquier acción incierta; los datos durables permanecen en Cloudflare.

La alternativa local `.\Start-Remote-Game-Pilot.ps1` usa `data/remote.env`. La clave para aprobar el consentimiento OAuth está en `data/connection-key.txt`; sólo introducirla en la página HTTPS del nuevo MCP. Estos archivos están excluidos de Git.

## Verificación después de publicar

### WireGuard desde el lanzador

El usuario activa WireGuard y selecciona un `.conf` en el formulario de links. El contenido viaja sólo al servidor loopback del lanzador y luego a GitHub Actions Secrets mediante `gh secret set` por stdin. Los archivos `queues/UUID.json` contienen únicamente la referencia `WG_CONFIG_<SHA256 del perfil normalizado>`, no las claves. Cada perfil distinto tiene su propia referencia: una subida posterior no modifica tandas en espera. Los secretos se conservan hasta que el propietario los elimine en Settings; respetar las tandas que todavía los necesitan.

El workflow recibe `wireguard_secret`, valida nuevamente el perfil, instala WireGuard y resolvconf, abre `gpwg`, configura bloqueo de salida directa IPv4/IPv6 y exige ruta IPv4 por gpwg, handshake reciente y HTTPS funcional. La carga de la lista rechaza una referencia VPN distinta o ausente. No se inicia el supervisor si falla alguno de esos pasos. El túnel afecta al job completo, incluido MCP y las comunicaciones de Actions. La limpieza `always()` desconecta y retira archivos temporales después de detener los navegadores; una VM destruida también pierde esos archivos. No se configura WireGuard en la PC del usuario.

Se aceptan perfiles estándar de cliente con una interfaz, un peer, DNS como IP y ruta IPv4 completa; no se admiten scripts de configuración ni extensiones de proveedores. No reutilizar simultáneamente este peer en otra máquina; emitir un perfil dedicado desde el servidor VPN. Los tests de Linux simulan el sistema y verifican orden del firewall y rechazo sin handshake; no prueban la conexión de un perfil real del usuario.

`/health` debe responder `ok:true` y schemaVersion 1 con el esquema D1 instalado. Ejecutar `node scripts/verify-deployment.mjs` con las variables privadas `PILOT_URL` y `PILOT_MCP_TOKEN`. Ese script comprueba health, initialize y herramientas, sin iniciar juegos.

Validar también OAuth en el cliente real y una demo individual. Después ampliar a ocho sesiones sólo para juegos que abran y se puedan controlar. No confundir una compilación o una CI verde con un despliegue probado.

## Datos y límites

SQLite local persiste en `data/pilot.sqlite`; imágenes/exportaciones en `data/objects`. En Cloudflare, D1 conserva un documento CAS por run y por sesión; R2 conserva blobs por hash y exportaciones. La comparación por versión evita perder actualizaciones concurrentes.

Cada documento de sesión está limitado a 850 KB. El registro no se recorta silenciosamente. Para tandas largas, exportar y abrir tandas pequeñas; el diseño permite una futura normalización de eventos sin cambiar el contrato MCP.

No se acelera ni se multiplica el ritmo de aperturas por usar más ejecutores. Esta primera versión no incluye una política de pacing global por proveedor; iniciar una tanda sólo con los límites autorizados para los proveedores seleccionados. No interpretar cuatro procesos como permiso para superar esos límites.

## Detención

Desde MCP: `pause_run` o `stop_run` y comprobar reconocimientos. En local, Ctrl+C en el iniciador envía stop al supervisor y cierra su coordinador. No borrar datos como mecanismo de parada.

## Reproducción

`export_replay` produce manifiesto JSON y eventos JSONL privados. Las imágenes están referenciadas por su clave privada; obtenerlas con `GET /v1/image?key=<hash>.jpg` autenticado. `GET /v1/export?runId=<id>` descarga el manifiesto autenticado.

`start_replay` crea otra tanda conservando los pasos verificados. `advance_replay` vuelve a resolver un objetivo único en una observación reciente y comprueba el estado previo. Si el motor sólo tiene canvas o el objetivo cambió, la ruta se detiene para una decisión visual nueva. Los resultados aleatorios no forman parte de la garantía.
