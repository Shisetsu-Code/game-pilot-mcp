# Cliente MCP y decisiones

## Conexión

### ChatGPT web

1. Abrir [ChatGPT Plugins](https://chatgpt.com/plugins).
2. Elegir **+ → Add custom MCP server**, nombre **Game Pilot** y URL **https://game-pilot-mcp.braian-n-l.workers.dev/mcp**.
3. Seleccionar **OAuth**. El servidor admite registro dinámico de clientes (DCR) y documentos de metadatos de cliente (CIMD).
4. Crear el plugin, instalarlo y conectar. La página de Game Pilot pide la clave privada guardada localmente en `data/connection-key.txt`; no es la contraseña de ChatGPT.
5. En una conversación nueva, escribir **@**, seleccionar **Game Pilot** y pedir `list_runs` para comprobar el acceso.

Los permisos del workspace pueden limitar la creación o instalación. Pasos contrastados con la [documentación oficial de conexión](https://developers.openai.com/api/docs/guides/custom-mcp-server#how-to-use); la interfaz puede cambiar. Esta conexión es la de ChatGPT, independiente de la configuración local de Codex.

### Otros clientes y conexión técnica

Local: importar `data/mcp-config.json` en un cliente que admita stdio. El puente usa `scripts/stdio.mjs` y el coordinador debe estar iniciado.

Remoto: publicar `src/entry.js` en Cloudflare y conectar la URL HTTPS `/mcp` con OAuth. La autorización muestra nombre del cliente, destino y permisos; se ingresa la clave privada de conexión del proyecto, nunca la contraseña de ChatGPT o Cloudflare. Los ejecutores usan otra credencial independiente.

La configuración de conexión de ChatGPT depende de la disponibilidad del producto/cuenta. Seguir la [documentación oficial de autenticación](https://developers.openai.com/plugins/build/auth) y [servidores MCP personalizados](https://developers.openai.com/api/docs/guides/custom-mcp-server). La biblioteca implementa descubrimiento, registro, PKCE, consentimiento y tokens. La prueba local recorre este flujo completo y accede a MCP con el token emitido; aún se necesita validar la conexión en la cuenta real del usuario después del despliegue.

## Identidad y coordenadas

Cada observación incluye `sessionId`, `observationId`, `revision`, `decisionLease`, `geometry`, `state`, controles y hash/referencia de la imagen.

Las coordenadas `x,y` de `submit_decisions` son normalizadas **dentro de la imagen del juego**, de 0 a 1. El ejecutor las convierte usando el recorte de página original, no el tamaño comprimido. Una imagen de 960 píxeles puede corresponder a un área de juego de 1280 píxeles: no enviar directamente sus píxeles como coordenadas de página.

```json
{
  "decisions": [{
    "commandId": "unique-command",
    "sessionId": "session-from-observation",
    "observationId": "observation-from-batch",
    "revision": 1,
    "leaseId": "decisionLease-from-observation",
    "action": {"type": "click", "x": 0.25, "y": 0.7},
    "goal": "buy",
    "target": "Buy Free Spins",
    "reason": "Opción visible, ronda terminada y saldo ficticio"
  }]
}
```

Goals: `buy`, `spin`, `navigate`, `continue`, `pick`, `inspect`. Inputs: `click`, `move`, `drag`, `scroll`, `key`. No hay herramienta de JavaScript arbitrario.

## Ciclo del revisor

El flujo con un agente navegador y clasificadores separados se describe en [Navegación y clasificación](vision-loop.md). El clasificador devuelve evidencia visual; el navegador decide y ejecuta. No usar colas de Hybrid Fuzzer 2 para esta tarea.

Después de una ronda, esperar inicialmente diez segundos y entonces pedir `request_observation`. La observación inmediata del input puede mostrar el inicio de la animación: esperar sin pedir otra imagen no la vuelve reciente. Si la reserva de revisión venció, obtener otra válida antes de actuar. Diez segundos no garantizan que un bonus haya terminado.

Analizar las pantallas juntas. Para cada una identificar estado, opciones visibles, página del menú y si la ronda está activa. Enviar `annotate_observations` por lote. No usar `idle` si sólo se sabe que no hubo una excepción.

Después de una acción, el resultado queda `observed`. Una compra se confirma con `review_results` sólo tras verificar la secuencia y el estado resultante. Si el bonus sigue activo, solicitar otra imagen: no emitir otra compra o tirada. Si requiere pulsar Continuar o elegir un elemento, enviar `goal: continue|pick` y `roundCommandId` con el identificador de la compra/tirada pendiente. Cada paso usa una observación nueva y revisada; la compra original permanece pendiente hasta terminar el bonus. Un resultado incierto exige reconciliación y nunca un retry del mismo clic.

`update_coverage` acumula todas las opciones descubiertas, incluso las deshabilitadas; no borra las de páginas anteriores. Usar un `id` estable para cada combinación de opción/configuración y `pageId` para la página donde se vio. Una opción que estuvo habilitada sigue siendo parte de la cobertura aunque luego se deshabilite; `currentlyDisabled` registra su condición más reciente. `menuExhausted` requiere haber comprobado scroll y páginas. Una compra distinta se identifica por su opción y configuración, no por sus coordenadas, que pueden cambiar.

El BFS conserva la frontera por juego. Consultar `get_game_graph`, seleccionar la rama pendiente de menor profundidad que se pueda alcanzar sin repetir compras y marcar el nodo expandido cuando sus salidas estén registradas. No enumerar todos los premios aleatorios como si fueran ramas nuevas.

## Control y recuperación

`pause_run`, `resume_run`, `stop_run` cambian el estado deseado. `get_run_status` muestra reconocimientos de los ejecutores. Stop no deshace una entrada emitida.

Un ejecutor caído conserva su diario. Las acciones emitidas sin resultado quedan inciertas; las que aún no se emitieron quedan bloqueadas. El archivo exportado permite inspeccionarlas antes de crear otra tanda o replay. No presentar un timeout como prueba de que la compra no ocurrió.

## Calidad y velocidad

`request_observation({sessionId,detail:true})` solicita detalle únicamente de esa sesión. Mantener las otras siete en el perfil comprimido.

`set_game_speed` solicita 1, 2 o 4. El factor efectivo se consulta en estado; una solicitud puede no aplicarse hasta cumplir compatibilidad, tres transiciones verificadas por nivel y estar fuera de ronda. No hay 8× habilitado sin validación específica.
