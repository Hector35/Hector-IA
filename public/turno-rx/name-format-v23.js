(() => {
  let observer = null;
  let scheduled = false;

  const GIVEN_NAMES = new Set(`
    ADRIAN ADRIANA ALAN ALBERTO ALEJANDRA ALEJANDRO ALFONSO ALFREDO ALICIA ANA ANDREA ANDRES ANGEL ANGELA ANTONIO ARTURO
    BEATRIZ BENJAMIN BRENDA BRAYAN CARLOS CARMEN CATALINA CECILIA CESAR CHRISTIAN CLAUDIA CRISTIAN CRISTINA
    DANIEL DANIELA DAVID DAYANA DIANA DIEGO EDGAR EDUARDO ELENA ELVA EMANUEL EMILIO ENRIQUE ERICK ERIKA ESMERALDA ESTEBAN ESTELA
    FABIOLA FELIPE FERNANDA FERNANDO FRANCISCA FRANCISCO GABRIEL GABRIELA GERARDO GLORIA GRACIELA GUADALUPE
    HECTOR HUGO ISABEL IVAN JESSICA JESUS JORGE JOSE JOSEFINA JUAN JULIANA JULIO KARLA LAURA LEONEL LETICIA LILIANA LORENA LUCIA LUIS LUZ
    MANUEL MARCELA MARCO MARCOS MARGARITA MARIA MARINA MARIO MARTA MARTIN MAURICIO MIGUEL MIRIAM MONICA NANCY NATALIA NICOLAS NORMA
    OLGA OMAR OSCAR OTONIEL PABLO PAOLA PATRICIA PEDRO RAFAEL RAQUEL RAUL RICARDO ROBERTO ROCIO RODRIGO ROSA RUBEN
    SALVADOR SAMUEL SANDRA SERGIO SILVIA SOCORRO SOFIA SUSANA TERESA VERONICA VICTOR VICTORIA YOLANDA YULIANA
  `.trim().split(/\s+/));

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const key = (value) => clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-zÑñ]/g, '')
    .toUpperCase();

  const isGiven = (token) => GIVEN_NAMES.has(key(token));

  function formatPatientName(value) {
    const source = clean(value);
    if (!source || source === '—') return '—';

    const upper = source.toLocaleUpperCase('es-MX');

    // Formato frecuente de expedientes: "APELLIDO(S), NOMBRE(S)".
    if (upper.includes(',')) {
      const [surnamePart, ...givenParts] = upper.split(',');
      const givenPart = clean(givenParts.join(' '));
      const surnames = clean(surnamePart);
      if (givenPart && surnames) return `${givenPart} ${surnames}`.replace(/\s+/g, ' ').trim();
    }

    const tokens = upper.split(' ').filter(Boolean);
    if (tokens.length < 2) return upper;

    // Si ya empieza con un nombre propio, conserva el orden y solo pasa a mayúsculas.
    if (isGiven(tokens[0])) return upper;

    // Algunos apellidos compuestos empiezan con DE/DEL/LA/LOS/LAS. No tomamos
    // como nombre el token inmediatamente posterior a esa partícula.
    const particles = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS']);
    let givenStart = -1;
    for (let i = 1; i < tokens.length; i += 1) {
      if (!isGiven(tokens[i])) continue;
      if (i > 0 && particles.has(tokens[i - 1])) continue;
      givenStart = i;
      break;
    }

    // APELLIDO(S) + NOMBRE(S) -> NOMBRE(S) + APELLIDO(S).
    if (givenStart > 0) {
      return [...tokens.slice(givenStart), ...tokens.slice(0, givenStart)].join(' ');
    }

    // Si no hay una señal confiable, no inventa el orden: solo mayúsculas.
    return upper;
  }

  function applyNames(root = document) {
    root.querySelectorAll?.('.imaging-row .patient-name').forEach((node) => {
      const raw = node.dataset.rawPatientName || clean(node.textContent);
      if (!raw || raw === '—') return;
      if (!node.dataset.rawPatientName) node.dataset.rawPatientName = raw;
      const formatted = formatPatientName(raw);
      if (formatted && node.textContent !== formatted) node.textContent = formatted;
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyNames(document);
    });
  }

  function start() {
    applyNames(document);
    const target = document.getElementById('app') || document.body;
    if (!target || observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
