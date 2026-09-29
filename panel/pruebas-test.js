/* ==========================================================================
   pruebas-test.js — pruebas del motor del test «Encuentra tu bonsái ideal».

   Se abren en http://localhost:8435/admin/pruebas-test (el proyecto no
   tiene Node: el navegador es el entorno de pruebas). Usan la configuración
   real de data/test-bonsai.json, así que si alguien toca una pregunta o un
   peso y rompe una regla, esto lo dice. Los catálogos, en cambio, son de
   laboratorio: productos inventados para cada caso, que no salen de aquí.

   Casos que cubren lo que pidió el negocio:
     - la luz filtra, no puntúa (y el caso «poca luz» sin ningún compatible)
     - nunca se recomienda para sombra ni interior sin sol (lucesProhibidas)
     - presupuesto sin coincidencias
     - productos agotados, apagados y sin validar
     - nunca más de 6 preguntas principales
     - el mensaje de WhatsApp no promete disponibilidad ni envío
   ========================================================================== */

const M = window.DGMotor;
const resultados = [];

function prueba(nombre, fn) {
  try {
    fn();
    resultados.push({ nombre, ok: true });
  } catch (e) {
    resultados.push({ nombre, ok: false, error: e.message });
  }
}

function ok(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'La condición no se cumple');
}

function igual(real, esperado, mensaje) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${mensaje || 'Distintos'}: esperaba ${b}, llegó ${a}`);
}

/* Un producto de laboratorio: lo mínimo que tiene catalog.json. */
function item(id, precio, altura, extra) {
  return Object.assign({
    id, nombre: `Bonsái ${id}`, precio: `$${precio}`, altura: `${altura} cm`,
    especie: `Especie ${id}`, badgeTexto: 'Disponible', imagen: 'x.webp', descripcion: '',
  }, extra || {});
}

/* Un perfil de laboratorio: acepta todo salvo lo que se sobrescriba. */
function perfil(extra) {
  return Object.assign({
    validado: true,
    luz: ['sol', 'exterior'],
    lugares: ['sala', 'dormitorio', 'escritorio', 'oficina', 'jardin'],
    estilos: [], usos: ['mi', 'regalo', 'hogar', 'negocio'], ocasiones: [],
    cuidado: ['diario', 'semanal', 'aprender', 'sencillo'],
    dificultad: 'facil', luzTexto: 'sol directo',
  }, extra || {});
}

/* La configuración real con otros perfiles. */
function conPerfiles(base, perfiles, extra) {
  return Object.assign({}, base, { perfiles, modoRevision: false }, extra || {});
}

async function correr() {
  const [config, catalogo] = await Promise.all([
    fetch('/data/test-bonsai.json').then((r) => r.json()),
    fetch('/data/catalog.json').then((r) => r.json()),
  ]);

  /* --- Preguntas ---------------------------------------------------------- */

  const principales = (lista) => lista.filter((p) => !p.condicional).length;
  const ids = (lista) => lista.map((p) => p.id);

  prueba('Nunca más de 6 preguntas principales, sea cual sea el camino', () => {
    const para = ['mi', 'regalo', 'hogar', 'negocio'];
    const lugar = ['sala', 'dormitorio', 'escritorio', 'oficina', 'jardin', 'nose'];
    para.forEach((a) => lugar.forEach((b) => {
      const n = principales(M.preguntasVisibles(config, { para: a, lugar: b }));
      ok(n <= config.maxPreguntasPrincipales, `${a}/${b}: ${n} principales`);
    }));
  });

  prueba('La ocasión solo se pregunta si es regalo', () => {
    ok(ids(M.preguntasVisibles(config, { para: 'regalo' })).includes('ocasion'));
    ok(!ids(M.preguntasVisibles(config, { para: 'mi' })).includes('ocasion'));
  });

  prueba('En un regalo no se pregunta el tiempo de cuidado: se asume algo sencillo', () => {
    ok(!ids(M.preguntasVisibles(config, { para: 'regalo' })).includes('cuidado'));
    igual(M.respuestasEfectivas(config, { para: 'regalo' }).cuidado, 'sencillo');
  });

  prueba('Jardín o terraza: la luz se deduce (exterior) y no se pregunta', () => {
    ok(!ids(M.preguntasVisibles(config, { para: 'mi', lugar: 'jardin' })).includes('luz'));
    igual(M.respuestasEfectivas(config, { para: 'mi', lugar: 'jardin' }).luz, 'exterior');
  });

  prueba('Lo deducido pisa una respuesta vieja que ya no se ve', () => {
    const r = M.respuestasEfectivas(config, { para: 'mi', lugar: 'jardin', luz: 'poca' });
    igual(r.luz, 'exterior');
  });

  prueba('Dejar de ser regalo borra la ocasión', () => {
    const r = M.respuestasEfectivas(config, { para: 'mi', ocasion: 'cumpleanos' });
    ok(!('ocasion' in r), 'la ocasión sigue ahí');
  });

  prueba('Las preguntas de luz y presupuesto nunca se recortan', () => {
    const lista = ids(M.preguntasVisibles(config, { para: 'mi', lugar: 'sala' }));
    ok(lista.includes('luz') && lista.includes('presupuesto'), lista.join(','));
  });

  /* --- Filtro de luz ------------------------------------------------------ */

  prueba('La luz filtra: con poca luz solo sale el que la tolera, aunque puntúe menos', () => {
    // Laboratorio del mecanismo: aquí se levanta la regla de luces prohibidas.
    const cfg = conPerfiles(config, {
      sombra: perfil({ luz: ['poca', 'indirecta'] }),
      estrella: perfil({ luz: ['sol'], estilos: ['elegante'], lugares: ['sala'] }),
    }, { lucesProhibidas: [] });
    const productos = M.prepararProductos([item('sombra', 30, 30), item('estrella', 30, 30)], cfg);
    const res = M.recomendar(productos, { para: 'mi', lugar: 'sala', luz: 'poca', estilo: 'elegante' }, cfg);
    igual(res.resultados.map((c) => c.producto.id), ['sombra']);
    igual(res.estado, 'pocos');
    igual(res.descartes.luz, 1);
  });

  prueba('Con el catálogo real, «poca luz» no recomienda nada que necesite sol sin decirlo', () => {
    const cfg = Object.assign({}, config, { modoRevision: true });
    const res = M.recomendar(M.prepararProductos(catalogo, cfg), { para: 'mi', lugar: 'sala', luz: 'poca' }, cfg);
    res.resultados.forEach((c) => {
      const tolera = c.producto.perfil.luz.includes('poca');
      ok(tolera || c.condicionLuz, `${c.producto.id} no tolera poca luz y no avisa`);
    });
    if (res.estado === 'luz-alternativa') {
      ok(res.resultados.every((c) => c.producto.perfil.luz.includes(res.luzAlternativa)));
    }
  });

  prueba('Regla de DecoGarden: nunca se recomienda para poca luz ni luz indirecta', () => {
    ok((config.lucesProhibidas || []).includes('poca'), 'falta poca en lucesProhibidas');
    ok((config.lucesProhibidas || []).includes('indirecta'), 'falta indirecta en lucesProhibidas');
    // Aunque un perfil las marque a mano, el motor las ignora.
    const cfg = conPerfiles(config, { a: perfil({ luz: ['poca', 'indirecta', 'sol'] }) });
    ['poca', 'indirecta'].forEach((luz) => {
      const res = M.recomendar(M.prepararProductos([item('a', 30, 30)], cfg), { luz }, cfg);
      ok(res.resultados.every((c) => c.condicionLuz), `${luz}: recomendado sin condición`);
      ok(res.estado === 'luz-alternativa' || res.estado === 'sin-compatibles', `${luz}: ${res.estado}`);
    });
  });

  prueba('Todos los perfiles reales están validados y el test no está en revisión', () => {
    Object.entries(config.perfiles).filter(([k]) => !k.startsWith('_')).forEach(([k, p]) =>
      ok(p.validado, `${k} sin validar`));
    igual(config.modoRevision, false);
  });

  prueba('Sin ninguno compatible y sin alternativa: lista vacía, no se rellena', () => {
    const cfg = conPerfiles(config, { a: perfil({ luz: ['exterior'] }) }, { luzAlternativa: {} });
    const res = M.recomendar(M.prepararProductos([item('a', 30, 30)], cfg), { luz: 'poca' }, cfg);
    igual(res.estado, 'sin-compatibles');
    igual(res.resultados.length, 0);
  });

  prueba('Luz alternativa: cada tarjeta lleva la condición escrita', () => {
    const cfg = conPerfiles(config, { a: perfil({ luz: ['sol'] }), b: perfil({ luz: ['sol'] }) });
    const res = M.recomendar(M.prepararProductos([item('a', 30, 30), item('b', 25, 30)], cfg), { luz: 'poca' }, cfg);
    igual(res.estado, 'luz-alternativa');
    ok(res.resultados.every((c) => /sol directo/i.test(c.condicionLuz)), 'falta la condición');
  });

  prueba('«No estoy seguro» no filtra, pero cada tarjeta dice qué luz necesita', () => {
    const cfg = conPerfiles(config, { a: perfil({ luz: ['sol'], luzTexto: 'sol directo varias horas' }) });
    const res = M.recomendar(M.prepararProductos([item('a', 30, 30)], cfg), { luz: 'nose' }, cfg);
    igual(res.resultados.length, 1);
    ok(res.resultados[0].avisos.some((a) => a.includes('sol directo varias horas')));
  });

  /* --- Disponibilidad ---------------------------------------------------- */

  prueba('Agotados, apagados y sin perfil no se recomiendan nunca', () => {
    const cfg = conPerfiles(config, {
      vendido: perfil(), reservado: perfil(), apagado: perfil(), marcado: perfil({ stock: 'agotado' }), bueno: perfil(),
    });
    const productos = M.prepararProductos([
      item('vendido', 30, 30, { badgeTexto: 'Vendido' }),
      item('reservado', 30, 30, { badgeTexto: 'Reservado' }),
      item('apagado', 30, 30, { activo: false }),
      item('marcado', 30, 30),
      item('sinperfil', 30, 30),
      item('bueno', 30, 30),
    ], cfg);
    const res = M.recomendar(productos, { luz: 'sol' }, cfg);
    igual(res.resultados.map((c) => c.producto.id), ['bueno']);
    igual(res.descartes, { sinPerfil: 1, apagado: 1, agotado: 3, sinValidar: 0, luz: 0 });
  });

  prueba('«Última pieza» sigue siendo recomendable', () => {
    const cfg = conPerfiles(config, { a: perfil() });
    const res = M.recomendar(M.prepararProductos([item('a', 30, 30, { badgeTexto: 'Última pieza' })], cfg), {}, cfg);
    igual(res.resultados.length, 1);
  });

  prueba('Sin modo revisión, un perfil sin validar no sale', () => {
    const cfg = conPerfiles(config, { a: perfil({ validado: false }), b: perfil() });
    const res = M.recomendar(M.prepararProductos([item('a', 30, 30), item('b', 30, 30)], cfg), {}, cfg);
    igual(res.resultados.map((c) => c.producto.id), ['b']);
    igual(res.revision, false);
  });

  prueba('En modo revisión sí sale, y el resultado lo marca', () => {
    const cfg = conPerfiles(config, { a: perfil({ validado: false }) }, { modoRevision: true });
    const res = M.recomendar(M.prepararProductos([item('a', 30, 30)], cfg), {}, cfg);
    igual(res.resultados.length, 1);
    igual(res.revision, true);
  });

  /* --- Presupuesto ------------------------------------------------------- */

  prueba('Presupuesto sin coincidencias: los más cercanos, marcados como alternativa', () => {
    const cfg = conPerfiles(config, { a: perfil(), b: perfil(), c: perfil(), d: perfil() });
    const productos = M.prepararProductos([
      item('a', 150, 60), item('b', 41, 20), item('c', 45, 20), item('d', 55, 30),
    ], cfg);
    const res = M.recomendar(productos, { presupuesto: '20-40', luz: 'sol' }, cfg);
    igual(res.estado, 'fuera-presupuesto');
    igual(res.resultados.map((c) => c.producto.id), ['b', 'c', 'd']);
    ok(res.resultados.every((c) => c.alternativa));
    ok(res.resultados[0].avisos.some((a) => /Se pasa \$1 /.test(a)), res.resultados[0].avisos.join(' | '));
  });

  prueba('Con el catálogo real, «hasta $20» recomienda los de $20 como coincidencia, no como alternativa', () => {
    const cfg = Object.assign({}, config, { modoRevision: true });
    const res = M.recomendar(M.prepararProductos(catalogo, cfg), { presupuesto: 'hasta-20', luz: 'sol' }, cfg);
    ok(res.resultados.length, 'sin resultados');
    res.resultados.forEach((c) => {
      const real = catalogo.find((x) => x.id === c.producto.id);
      ok(real && real.precio === c.producto.item.precio, 'precio distinto al catálogo');
      ok(c.producto.precio <= 20 || c.alternativa, `${c.producto.id} pasa de $20 y no va marcado como alternativa`);
    });
    const hayDe20 = catalogo.some((x) => M.precioNumero(x.precio) <= 20 && cfg.perfiles[x.id]);
    if (hayDe20) ok(!res.resultados[0].alternativa, 'el primero debería entrar en el presupuesto');
  });

  prueba('Parcial: primero los que entran en el presupuesto, luego las alternativas', () => {
    const cfg = conPerfiles(config, { a: perfil(), b: perfil(), c: perfil() });
    const productos = M.prepararProductos([item('a', 30, 30), item('b', 90, 30), item('c', 45, 30)], cfg);
    const res = M.recomendar(productos, { presupuesto: '20-40', luz: 'sol' }, cfg);
    igual(res.estado, 'parcial');
    igual(res.resultados[0].producto.id, 'a');
    igual(res.resultados[0].alternativa, false);
    igual(res.resultados.slice(1).map((c) => c.producto.id), ['c', 'b']);
  });

  prueba('«Quiero conocer opciones» no descarta por precio', () => {
    const cfg = conPerfiles(config, { a: perfil(), b: perfil(), c: perfil() });
    const productos = M.prepararProductos([item('a', 300, 60), item('b', 10, 20), item('c', 45, 30)], cfg);
    const res = M.recomendar(productos, { presupuesto: 'abierto', luz: 'sol' }, cfg);
    igual(res.resultados.length, 3);
    ok(res.resultados.every((c) => !c.alternativa));
    igual(res.estado, 'exacto');
  });

  /* --- Puntuación -------------------------------------------------------- */

  prueba('Devuelve como mucho tres, distintos y ordenados por coincidencia', () => {
    const cfg = Object.assign({}, config, { modoRevision: true });
    const res = M.recomendar(M.prepararProductos(catalogo, cfg),
      { para: 'mi', lugar: 'sala', luz: 'sol', estilo: 'elegante', presupuesto: 'abierto' }, cfg);
    ok(res.resultados.length <= 3);
    igual(new Set(res.resultados.map((c) => c.producto.id)).size, res.resultados.length, 'repetidos');
  });

  prueba('Gana el que coincide en estilo, lugar y tamaño', () => {
    const cfg = conPerfiles(config, {
      justo: perfil({ estilos: ['delicado'], lugares: ['escritorio'] }),
      otro: perfil({ estilos: ['frondoso'], lugares: ['jardin'] }),
    });
    const productos = M.prepararProductos([item('otro', 20, 50), item('justo', 25, 20)], cfg);
    const res = M.recomendar(productos, { lugar: 'escritorio', luz: 'sol', estilo: 'delicado', tamano: 'pequeno' }, cfg);
    igual(res.resultados[0].producto.id, 'justo');
    ok(res.resultados[0].puntos > res.resultados[1].puntos);
  });

  prueba('Quien pide algo sencillo no recibe primero uno exigente', () => {
    const cfg = conPerfiles(config, {
      exigente: perfil({ dificultad: 'media', cuidado: ['aprender'], estilos: ['elegante'] }),
      facil: perfil({ dificultad: 'facil', cuidado: ['sencillo'] }),
    });
    const productos = M.prepararProductos([item('exigente', 30, 30), item('facil', 30, 30)], cfg);
    const res = M.recomendar(productos, { luz: 'sol', cuidado: 'sencillo', estilo: 'elegante' }, cfg);
    igual(res.resultados[0].producto.id, 'facil');
    ok(res.resultados[1].avisos.some((a) => /atención/.test(a)), 'falta el aviso');
  });

  prueba('Variedad: no tres de la misma especie si hay otra casi igual de buena', () => {
    // Los juníperos ganan por un punto (el uso); el otro coincide en todo lo demás.
    const cfg = conPerfiles(config, {
      j1: perfil({ estilos: ['elegante'], usos: ['mi'] }), j2: perfil({ estilos: ['elegante'], usos: ['mi'] }),
      j3: perfil({ estilos: ['elegante'], usos: ['mi'] }), otro: perfil({ estilos: ['elegante'], usos: [] }),
    });
    const juniper = { especie: 'Juniperus chinensis' };
    const productos = M.prepararProductos([
      item('j1', 30, 30, juniper), item('j2', 30, 30, juniper), item('j3', 30, 30, juniper), item('otro', 30, 30),
    ], cfg);
    const res = M.recomendar(productos, { para: 'mi', luz: 'sol', estilo: 'elegante' }, cfg);
    const elegidos = res.resultados.map((c) => c.producto.id);
    igual(elegidos[0], 'j1');
    ok(elegidos.includes('otro'), elegidos.join(','));
  });

  prueba('El tamaño sale de la altura del catálogo', () => {
    igual(M.tamanoDe(20, config.tamanos), 'pequeno');
    igual(M.tamanoDe(30, config.tamanos), 'mediano');
    igual(M.tamanoDe(60, config.tamanos), 'grande');
  });

  /* --- WhatsApp ---------------------------------------------------------- */

  const cfgWa = conPerfiles(config, { a: perfil(), b: perfil(), c: perfil() });
  const resWa = M.recomendar(M.prepararProductos(
    [item('a', 30, 30, { nombre: 'Bonsái Guayacán' }), item('b', 30, 30, { nombre: 'Bonsái Azalea' }),
      item('c', 30, 30, { nombre: 'Bonsái del Árbol del Té' })], cfgWa),
  { para: 'regalo', ocasion: 'cumpleanos', luz: 'sol', presupuesto: '20-40' }, cfgWa);

  prueba('Mensaje de un producto: lo nombra, cita a los otros y pregunta, no afirma', () => {
    const texto = M.mensajeWhatsApp(cfgWa, resWa, { para: 'regalo', ocasion: 'cumpleanos', presupuesto: '20-40' },
      resWa.resultados[1].producto);
    ok(texto.startsWith('Hola, DecoGarden. Hice el test de bonsáis'));
    ok(texto.includes(`me interesa el ${M.nombreCorto(resWa.resultados[1].producto)}`));
    ok(/disponibilidad, precio actualizado y envío/.test(texto));
    ok(/presupuesto: \$20 – \$40/.test(texto), texto);
    ok(/cumpleaños/.test(texto));
    ok(!/gratis|está disponible|en stock/i.test(texto), 'promete algo');
  });

  prueba('Mensaje de «ver los 3»: los tres nombres', () => {
    const texto = M.mensajeWhatsApp(cfgWa, resWa, {});
    resWa.resultados.forEach((c) => ok(texto.includes(M.nombreCorto(c.producto)), M.nombreCorto(c.producto)));
  });

  prueba('Mensaje sin resultados: pide ayuda, no nombra productos', () => {
    const texto = M.mensajeWhatsApp(cfgWa, { resultados: [] }, { luz: 'poca' });
    ok(/no encontré/.test(texto));
  });

  prueba('Enlace wa.me con el número de DecoGarden y el texto codificado', () => {
    const url = M.enlaceWhatsApp('+593 96 313 6655', 'Hola & ¿qué tal?');
    igual(url, 'https://wa.me/593963136655?text=Hola%20%26%20%C2%BFqu%C3%A9%20tal%3F');
    ok(M.enlaceWhatsApp(config.whatsapp, 'x').startsWith('https://wa.me/593963136655?'));
  });

  /* --- Datos reales ------------------------------------------------------- */

  prueba('Cada perfil apunta a un producto que existe en el catálogo', () => {
    const idsCatalogo = new Set(catalogo.map((p) => p.id));
    Object.keys(config.perfiles).filter((k) => !k.startsWith('_')).forEach((k) =>
      ok(idsCatalogo.has(k), `perfil huérfano: ${k}`));
  });

  prueba('Cada perfil tiene al menos una luz, y solo luces que el test conoce', () => {
    const luces = config.preguntas.find((p) => p.id === 'luz').opciones.map((o) => o.id);
    Object.entries(config.perfiles).filter(([k]) => !k.startsWith('_')).forEach(([k, p]) => {
      ok(p.luz.length, `${k} sin luz`);
      p.luz.forEach((l) => ok(luces.includes(l), `${k}: luz desconocida ${l}`));
    });
  });

  pintar(config);
}

function pintar(config) {
  const fallos = resultados.filter((r) => !r.ok);
  const lista = document.getElementById('lista');
  lista.innerHTML = resultados.map((r) => `<li class="${r.ok ? 'ok' : 'mal'}">
      <span>${r.ok ? '✓' : '✗'}</span> ${r.nombre}${r.ok ? '' : `<pre>${r.error.replace(/</g, '&lt;')}</pre>`}
    </li>`).join('');
  const resumen = document.getElementById('resumen');
  resumen.textContent = fallos.length
    ? `${fallos.length} de ${resultados.length} pruebas fallan`
    : `Las ${resultados.length} pruebas pasan`;
  resumen.className = fallos.length ? 'mal' : 'ok';
  document.getElementById('modo').textContent = config.modoRevision
    ? 'test-bonsai.json está en modo revisión.'
    : 'test-bonsai.json está publicado (sin modo revisión).';
  document.title = `${fallos.length ? '✗' : '✓'} Pruebas del test`;
  window.RESULTADO_PRUEBAS = { total: resultados.length, fallos };
}

correr().catch((e) => {
  document.getElementById('resumen').textContent = `No se pudieron correr: ${e.message}`;
  window.RESULTADO_PRUEBAS = { total: 0, fallos: [{ nombre: 'carga', error: e.message }] };
});
