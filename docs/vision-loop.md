# Navegación y clasificación de capturas

## Objetivo y funciones

El agente navegador ejecuta las compras con saldo ficticio y completa sus bonus. Los clasificadores observan capturas y devuelven información visual; no manejan el juego ni compran por su cuenta. Se atienden varios juegos independientes mientras otros cargan o animan una ronda.

La meta por juego es completar las funciones comprables, incluidos free spins, bonus buy, antebet o equivalentes, y tres tiradas normales. Deben conservarse capturas, coordenadas, inputs, resultados y el grafo BFS. Esta meta no es una garantía de compatibilidad universal ya conseguida.

Usar **https://game-pilot-mcp.braian-n-l.workers.dev/mcp** y **Shisetsu-Code/game-pilot-mcp**. Un clasificador con instrucciones antiguas de Hybrid Fuzzer 2 debe cambiar de asignación explícitamente: sus colas pertenecen a otro proyecto.

## Una vuelta del ciclo

1. **Observar:** `get_observations` devuelve hasta ocho capturas de sesiones listas. Se puede filtrar por `sessionIds`; no esperar a completar ocho imágenes.
2. **Clasificar:** pasar la imagen real y sus `sessionId`, `observationId`, `revision` y hash al clasificador. Debe declarar si pudo verla.
3. **Registrar:** `annotate_observations` guarda el estado usando la revisión y `decisionLease` actuales. Distinguir base, menú, confirmación, bonus activo y resultado.
4. **Actuar:** el navegador envía una acción por juego listo mediante `submit_decisions`. Los juegos independientes pueden avanzar en el mismo lote.
5. **Esperar:** inicialmente diez segundos después de una tirada o avance de bonus. Una navegación simple no requiere por definición esa espera completa.
6. **Capturar después de la espera:** pedir `request_observation` y esperar una observación nueva. No reutilizar la foto inmediata del input como si fuera posterior a los diez segundos. Mientras se genera, atender otros juegos.
7. **Verificar:** clasificar la captura nueva y usar `review_results` sólo para resultados comprobables. Un bonus activo requiere continuación o espera; su compra original permanece pendiente.

La reserva de revisión vence. Si cambió la observación o venció su lease, obtener una revisión válida y comprobar otra vez la pantalla; no cambiar sólo el número de revisión de unas coordenadas antiguas.

## Respuesta del clasificador

Ejemplo de intercambio entre agente y clasificador; no es el cuerpo literal de una herramienta MCP:

```json
{
  "viewed": true,
  "sessionId": "session-id",
  "observationId": "observation-id",
  "revision": 12,
  "screen": "bonus_between_spins",
  "roundPhase": "active",
  "evidence": "Bonus 7/15, acumulado 380 y START visible",
  "controls": [{"label": "START", "x": 0.948, "y": 0.913}]
}
```

Las coordenadas son normalizadas dentro de la captura del juego, entre 0 y 1. El ejecutor las transforma al viewport/iframe real. No copiar coordenadas de otro juego o pantalla.

Si no pudo abrir la imagen, devolver `viewed:false` y el error. Una descripción textual o una cabecera JPEG decodificada no equivalen a haber visto la captura.

## Compra, continuación y resultado

- `goal: buy` inicia una función comprada. Abrir una confirmación no demuestra que el bonus terminó.
- `goal: continue` avanza una introducción, START, confirmación o cierre de resultado de la misma secuencia.
- `goal: pick` elige un cofre u otro elemento del bonus.
- Las continuaciones y elecciones de una compra pendiente usan `roundCommandId` con el ID de la compra original, no el de la última continuación.
- Un débito confirma que hubo gasto, no que la función terminó. `observed` confirma una observación, no una tirada completa.
- `blocked` con `notExecuted:true` indica que el input no llegó a ejecutarse. Revisar evidencia actual antes de intentar otra acción.
- `uncertain` indica que el input pudo haber ocurrido. Reconciliar con `reconcile_session`; no repetirlo automáticamente.

Comprobar siempre el ID y objetivo antes de revisar un comando. El último `observed` podría ser la compra original cuando se pretendía revisar una continuación bloqueada.

## Velocidad

Preferir Turbo/Quick Spin nativo cuando esté visible y verificar que quedó activado. No atribuirle un factor exacto x4 sin medirlo.

`set_game_speed` actúa sólo sobre animaciones compatibles, necesita transiciones verificadas y aplica fuera de ronda. Consultar su factor efectivo. No hay aceleración universal de canvas, timers, red ni inferencia del modelo.

## Envío a chats: estado real

Antes de repartir una tanda grande hay que probar tanto la entrega de la imagen como la recuperación de la respuesta.

- El clasificador interno con acceso a archivos pudo abrir los JPEG de Game Pilot.
- Un chat normal existente no pudo descargar la captura por URL HTTPS. Reenviarla como texto base64 tampoco permitió visualizarla completa. Esa integración sigue pendiente.
- Los mensajes entre chats envían texto; no garantizan adjuntar una imagen ni devolver una respuesta visual como texto recuperable.
- Se probó GPT Messages para recuperar el JSON de clasificación. Eso no entrega por sí mismo los píxeles ni crea inferencia autónoma.

El backend incluye `GET /v1/shared-image?key=...&expires=...&signature=...`. Un enlace firmado autoriza un único JPEG durante un máximo de quince minutos, sin entregar las credenciales MCP. Se validan firma, clave y vencimiento. La función de firma está en `src/image-share.js`; el lanzador todavía no ofrece una interfaz de entrega a chats. Su accesibilidad desde el receptor debe comprobarse. Las rutas privadas normales siguen autenticadas.

## Cobertura y cierre

`update_coverage` acumula opciones por ID estable y página. `menuExhausted:true` requiere evidencia de haber agotado páginas y controles relevantes; no sirve para ocultar trabajo desconocido. Si el usuario limita la búsqueda a opciones visibles, documentar ese alcance.

`complete_game` comprueba las opciones registradas, resultados verificados y tres tiradas normales. Es un control de consistencia; no descubre opciones que el agente nunca vio.

Los errores reales de proveedor se registran y permiten continuar con otros. Una carga o ronda activa requiere otra captura. Si un navegador se cerró después de una compra, conservarla pendiente o incierta: abrir otra demo no recupera automáticamente la partida perdida.
