# Operación y publicación

## Estado de acceso inicial

La primera comprobación de GitHub falló por la restricción de red del entorno; al comprobarlo con red autorizada, la sesión de Shisetsu-Code resultó válida. El repositorio privado ya fue creado y publicado, y su CI pasó. `wrangler whoami` sí confirmó que falta autenticación de Cloudflare. No se leyó ni se reutilizó ningún secreto del fuzzer existente; completar ese acceso no requiere pegar secretos en el chat.

## GitHub

El repositorio ya existe y tiene `main` como rama principal. Para obtenerlo en otra carpeta o equipo:

```powershell
gh repo clone Shisetsu-Code/game-pilot-mcp
```

La copia local actual ya tiene `origin` configurado. No crear otro repositorio del mismo nombre. No incluir `.env`, `data`, `artifacts` ni `node_modules`.

## Cloudflare

Los nombres siguientes pertenecen exclusivamente al nuevo proyecto:

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

## Verificación después de publicar

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
