# Ciclo rápido de Pilot 2

El worker ejecuta y espera en cada juego de forma independiente. GPT recibe hasta ocho pantallas y devuelve las decisiones juntas. Ningún juego tiene que terminar para atender otro.

## Uso desde GPT

1. Pedir `get_observations` con `limit:8`; atender los disponibles aunque sean menos.
2. Usar `advance_batch` una vez con un elemento por juego. Cada elemento lleva `sessionId`, `observationId`, `revision`, `leaseId` (el `decisionLease` recibido), `state`, `reviews` de los `pendingResults` comprobables y, si corresponde, `decision`.
3. Si sigue animando y no necesita un clic, omitir `decision`. Eso libera la reserva y deja al worker esperar y generar otra captura. No retener la reserva durante minutos.

```json
{"items":[{"sessionId":"SESSION","observationId":"OBS","revision":12,"leaseId":"DECISION_LEASE","state":{"screen":"base","roundPhase":"idle"},"reviews":[{"commandId":"PREVIOUS","status":"verified","reason":"La captura muestra el resultado terminado"}],"decision":{"commandId":"NEXT_UNIQUE_ID","action":{"type":"click","x":0.9,"y":0.8},"goal":"spin","target":"Spin","reason":"Control visible e inactivo"}}]}
```

Los resultados de cada elemento son independientes: un juego con revisión vencida no impide avanzar a sus hermanos. Una revisión rechazada impide emitir la siguiente acción de ese juego.

Si el cliente todavía no descubre `advance_batch`, puede enviar `state` y `reviews` dentro de cada elemento de `submit_decisions.decisions`, junto con los campos habituales del clic. El servidor aplica el mismo ciclo combinado. Un elemento con `state` y sin `action` cede la espera al worker.

## Trabajo automático

- Catálogos conocidos: cookies, confirmación de edad y apertura de demo mediante controles DOM únicos.
- Premios DOM reconocidos: un control único «Click to continue», «Continue», «Collect», «OK», «Continuar» o «Cobrar», acompañado de texto de premio y sin una pregunta de compra o elección. La acción pasa por el mismo registro durable y comprobación visual que los clics de GPT.
- La compra se confirma automáticamente solamente cuando el cierre del premio vuelve a una base con control Spin visible y habilitado. Una tirada normal requiere haber observado su estado activo y luego su vuelta a idle. Un clic por sí solo no basta.
- Capturas habituales JPEG calidad 35, ancho máximo 768. `request_observation(detail:true)` conserva detalle selectivo.
- Se sondea localmente cada dos segundos mientras hay actividad pendiente; las imágenes casi idénticas no se suben. Se espera una pantalla estable antes de publicarla, con una salida periódica de 30 segundos para animaciones permanentes. Una petición explícita de captura evita el filtro.
- Después de un buy/spin ejecutado por el worker nuevo se reserva inicialmente una espera de diez segundos antes de ofrecer la imagen inmediata a GPT; los premios reconocidos pueden resolverse antes.
- Aceleración automática solicitada 4× al estar idle y existir Web Animations accesibles. Error o incertidumbre desactivan la aceleración. Esto **no** acelera universalmente motores canvas, audio, red ni relojes; para esos juegos GPT debe activar el turbo nativo si existe. El estado registra factor y método efectivos.
- Las tandas nuevas requieren dos tiradas normales por defecto; `start_run.normalSpins` permite otro objetivo. Las tandas antiguas conservan su objetivo anterior.

## Límites

Los controles dibujados sólo en canvas, las elecciones y los diálogos desconocidos siguen requiriendo visión de GPT. No se usan coordenadas prefijadas ni se interpreta una pantalla estable como prueba de compra terminada. No hay OCR ni un adaptador universal por proveedor en esta versión.

Publicar el MCP actualiza las herramientas; el ejecutor de GitHub carga su código al iniciar el job. Los jobs que ya están ejecutándose conservan el runner anterior. No reiniciarlos durante un bonus pagado sólo para actualizar: conservar la partida y aplicar el runner nuevo en la siguiente ejecución.

## Evidencia

Prueba local de navegador, ocho demos deterministas: un lote de ocho decisiones de compra, premios cerrados y ocho resultados verificados sin otra decisión de GPT. Tiempo medido desde el envío: 3.733 segundos en la ejecución individual inicial. Es una prueba de concurrencia y automatización, **no** una medida de inferencia de GPT ni del catálogo real.
