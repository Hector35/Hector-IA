(() => {
  const ORIGINAL_FETCH = window.fetch.bind(window);
  const FLOOR_PROMPT_ADDENDUM = `

RELECTURA ESPECIAL DE PIZARRONES ORIGEN → DESTINO:
- Si la imagen es un pizarrón de traslados a Piso con renglones tipo "14 - 72", "11 - UEH", "CE1 - 30", "CE2 - 14", léelo de ARRIBA HACIA ABAJO y devuelve UN objeto por cada par legible.
- El valor de la izquierda es la cama/área de ORIGEN y va en bed/handwrittenBed. El valor de la derecha es el DESTINO y va en destination y target.
- "OK", palomitas, rayas negras y tachones son ANOTACIONES; nunca son cama ni destino. Si son visibles, consérvalos solo en transferNotes/recognizedText. No deduzcas por tu cuenta que significan Pendiente o Realizado.
- No omitas un renglón únicamente porque esté tachado o tenga "OK": transcribe el par legible y conserva la anotación para revisión operativa.
- Haz una segunda pasada visual antes de responder para comprobar que no saltaste renglones. No te detengas al encontrar algunas camas; devuelve todos los pares legibles.
- No inventes pares para completar un total y no uses el nombre escrito en el encabezado como paciente.`;

  function isVisionRequest(input) {
    const url = typeof input === 'string' ? input : input?.url;
    return typeof url === 'string' && url.includes('/api/turno-rx/vision');
  }

  function withFloorPrompt(init) {
    if (!(init?.body instanceof FormData)) return init;
    const prompt = init.body.get('prompt');
    if (typeof prompt !== 'string' || prompt.includes('RELECTURA ESPECIAL DE PIZARRONES ORIGEN')) return init;
    const body = new FormData();
    for (const [key, value] of init.body.entries()) {
      body.append(key, key === 'prompt' ? `${prompt}${FLOOR_PROMPT_ADDENDUM}` : value);
    }
    return {...init, body};
  }

  window.fetch = function turnoRxVisionPromptV63(input, init) {
    return ORIGINAL_FETCH(input, isVisionRequest(input) ? withFloorPrompt(init) : init);
  };
})();
