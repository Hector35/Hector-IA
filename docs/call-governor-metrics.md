# Call governor metrics

La migración `0035_call_governor_events.sql` registra metadatos por usuario sin guardar prompts ni respuestas:

- inferencias avanzadas ejecutadas;
- inferencias idénticas compartidas entre solicitudes concurrentes;
- respuestas recuperadas desde la caché semántica D1;
- llamadas bloqueadas por presupuesto;
- pasadas solicitadas y ejecutadas;
- llamadas estimadas evitadas;
- justificaciones del gobernador.

La deduplicación usa SHA-256 sobre una clave que incluye usuario, plan, instrucción y contexto. El mapa en vuelo es compartido por el isolate del Worker, por lo que dos solicitudes iguales concurrentes reutilizan una sola promesa. La caché persistente sigue siendo responsabilidad de `hybrid-memory.ts`, aislada por usuario y namespace.

No añade proveedores ni dependencias pagadas.
