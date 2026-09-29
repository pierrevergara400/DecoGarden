/* ==========================================================================
   test.js — la interfaz del test «Encuentra tu bonsái ideal».

   Pinta las pantallas, guarda las respuestas en la sesión, arma los enlaces
   de WhatsApp y mide. Qué preguntar y qué recomendar lo decide test-motor.js;
   aquí no hay ninguna regla de recomendación.

   Navegación: cada pantalla es una entrada del historial, así el botón «atrás»
   del teléfono vuelve a la pregunta anterior en vez de sacar a la persona del
   test. Si recarga, history.state la devuelve adonde estaba.

   Medición: solo si la persona aceptó las cookies (la misma cookie dg_consent
   que usa pixel.js). Nunca se envían datos personales: el test no los pide.
   Con ?debug=1 los eventos se escriben en la consola, sin enviarse a nadie.
   ========================================================================== */

(function () {
  'use strict';

  const M = window.DGMotor;
  const CLAVE_SESION = 'dg_test_v1';
  const DEBUG = /[?&]debug=1\b/.test(location.search);
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);

  const estado = {
    config: null,
    productos: [],
    paginas: {},
    respuestas: {},
    resultado: null,
  };

  /* --- Iconos --------------------------------------------------------------
     Trazos sencillos a 24×24, en el color del texto. Van en línea para no
     pedir un archivo más en una conexión móvil. */
  const ICONOS = {
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    regalo: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v8h14v-8M12 9v12M12 9C10 5 6.5 5 6.5 7.2S9.5 9 12 9c2.5 0 5.5-.3 5.5-1.8S14 5 12 9"/>',
    casa: '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5"/>',
    maletin: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
    pastel: '<path d="M4 21h16M5 21v-7h14v7M5 17.5c2 1 3-1 5 0s3 1 4 0 3-1 5 0M12 14v-3"/><path d="M12 8.5c.9 0 1.2-1.2 0-2.8-1.2 1.6-.9 2.8 0 2.8z"/>',
    corazon: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    manos: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9a1.5 1.5 0 0 1 3 0v4a8 8 0 0 1-8 8h-.5A6.5 6.5 0 0 1 4 14.5V13a2 2 0 0 1 3-1.7"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>',
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    sofa: '<path d="M4 12V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2"/>',
    cama: '<path d="M3 19V6M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    escritorio: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    edificio: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3"/>',
    arbol: '<path d="M12 21v-6M9 21h6"/><path d="M12 15c-4 0-7-2-7-5.5S8 4 12 3c4 1 7 3 7 6.5S16 15 12 15z"/>',
    duda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    solNube: '<path d="M8 3v1.5M3 8h1.5M4.5 4.5l1 1M11.5 4.5l-1 1M5.6 10.6A3 3 0 0 1 10.6 6"/><path d="M8 20h9a4 4 0 0 0 .6-8 5 5 0 0 0-9.7 1.6A3.2 3.2 0 0 0 8 20z"/>',
    luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    brote: '<path d="M12 21v-9M12 12c0-4-3-7-8-7 0 4 3 7 8 7zM12 14c0-3 2.5-6 7-6 0 3.5-2.5 6-7 6z"/>',
    pluma: '<path d="M20 4C13 4 7 9 6 17l-2 3M6 17c6 0 10-4 11-9M9 13h5"/>',
    chispas: '<path d="M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    tamanoS: '<path d="M9 21h6l-1-3h-4zM12 18v-2"/><circle cx="12" cy="13.5" r="2.5"/>',
    tamanoM: '<path d="M8 21h8l-1-3.5H9zM12 17.5v-3"/><ellipse cx="12" cy="11" rx="4.5" ry="3.5"/>',
    tamanoL: '<path d="M6 21h12l-1.2-4H7.2zM12 17v-4"/><ellipse cx="12" cy="8.5" rx="7" ry="5"/>',
    moneda: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    atras: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
    aviso: '<path d="M12 3l9.5 17h-19zM12 10v4M12 17h.01"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  };

  const WHATSAPP_SVG = '<svg class="t-ico-wa" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m4.52 11.99c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14 0-.31-.01-.48-.01a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28"/></svg>';

  function icono(nombre, clase) {
    const trazo = ICONOS[nombre];
    if (!trazo) return '';
    return `<svg class="${clase || 't-ico'}" viewBox="0 0 24 24" aria-hidden="true">${trazo}</svg>`;
  }

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* --- Sesión --------------------------------------------------------------
     sessionStorage: dura lo que la pestaña y no sale del teléfono. Si el
     navegador no lo deja (modo privado de algunos), el test funciona igual,
     solo que no recuerda nada al recargar. */
  function guardarSesion(pantalla, preguntaId) {
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify({
        respuestas: estado.respuestas, pantalla, preguntaId,
      }));
    } catch (e) { /* sin almacenamiento: seguimos sin memoria */ }
  }

  function leerSesion() {
    try {
      const datos = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null');
      return datos && typeof datos.respuestas === 'object' ? datos : null;
    } catch (e) {
      return null;
    }
  }

  function borrarSesion() {
    try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
  }

  /* --- Medición ------------------------------------------------------------ */

  function hayConsentimiento() {
    return /(?:^|;\s*)dg_consent=granted/.test(document.cookie);
  }

  let ga4Cargado = false;
  function cargarGA4() {
    const id = estado.config && estado.config.analitica && estado.config.analitica.ga4Id;
    if (ga4Cargado || !id || !/^G-[A-Z0-9]+$/.test(id)) return;
    ga4Cargado = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  /* Un evento del embudo. El nombre es el mismo en GA4, en Meta (como evento
     personalizado) y en dataLayer, para que un tablero sirva para los tres.
     El clic en WhatsApp además lo cuenta pixel.js como «Contact». */
  function medir(evento, datos) {
    const d = Object.assign({ origen_test: 'encuentra-tu-bonsai' }, datos || {});
    if (DEBUG) console.info('[test]', evento, d);
    if (!hayConsentimiento()) return;
    cargarGA4();
    if (typeof window.gtag === 'function') window.gtag('event', evento, d);
    if (typeof window.fbq === 'function') window.fbq('trackCustom', evento, d);
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: evento }, d));
  }

  /* --- Pantallas ----------------------------------------------------------- */

  const PANTALLAS = ['tInicio', 'tPregunta', 'tCargando', 'tResultados', 'tError'];

  function mostrar(id, direccion) {
    PANTALLAS.forEach((p) => {
      const el = document.getElementById(p);
      const activa = p === id;
      el.hidden = !activa;
      el.classList.toggle('activa', activa);
      el.classList.toggle('desde-atras', activa && direccion === 'atras');
    });
    document.body.dataset.pantalla = id;
    $('#tProgreso').hidden = id !== 'tPregunta';
    // Sin animación: con scroll-behavior:smooth la subida competiría con la
    // entrada de la pantalla nueva.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  function enfocar(el) {
    if (!el) return;
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  /* --- Historial ----------------------------------------------------------- */

  function empujar(stateObj) {
    history.pushState(stateObj, '', location.pathname + location.search);
  }

  function reemplazar(stateObj) {
    history.replaceState(stateObj, '', location.pathname + location.search);
  }

  window.addEventListener('popstate', (e) => {
    const s = e.state;
    if (!estado.config) return;
    if (!s || !s.t) { pintarInicio(); return; }
    if (s.t === 'p') pintarPregunta(s.id, 'atras');
    else if (s.t === 'r') pintarResultados();
  });

  /* --- Inicio -------------------------------------------------------------- */

  function pintarInicio() {
    mostrar('tInicio');
    const sesion = leerSesion();
    const aMedias = sesion && Object.keys(sesion.respuestas).length > 0;
    $('#tReanudar').hidden = !aMedias;
  }

  /* --- Preguntas ----------------------------------------------------------- */

  function visibles() {
    return M.preguntasVisibles(estado.config, estado.respuestas);
  }

  function disposicion(pregunta) {
    if (pregunta.opciones.some((o) => o.imagen)) return 'fotos';
    if (pregunta.opciones.some((o) => o.detalle)) return 'lista';
    return 'rejilla';
  }

  function pintarPregunta(id, direccion) {
    const lista = visibles();
    let indice = lista.findIndex((p) => p.id === id);
    if (indice < 0) indice = 0;
    const pregunta = lista[indice];
    const total = lista.length;
    const elegida = estado.respuestas[pregunta.id];
    const titulo = (estado.respuestas.para === 'regalo' && pregunta.tituloRegalo) || pregunta.titulo;
    const modo = disposicion(pregunta);

    // Progreso: la pregunta en curso cuenta como empezada. No se enseña el
    // total: cambia en uno cuando una respuesta suma o ahorra una pregunta,
    // y un «3 de 7» que pasa a «4 de 6» parece un error. La barra no.
    const porcentaje = Math.round(((indice + 1) / (total + 1)) * 100);
    $('#tProgresoTexto').textContent = indice + 1 === total ? 'Última' : `Pregunta ${indice + 1}`;
    $('#tProgresoRelleno').style.width = porcentaje + '%';
    $('#tProgresoRiel').setAttribute('aria-valuenow', String(porcentaje));

    const opciones = pregunta.opciones.map((o) => {
      const marcada = elegida === o.id;
      const visual = o.imagen
        ? `<span class="t-op-foto"><img src="${esc(o.imagen)}" alt="" loading="lazy" width="300" height="300"></span>`
        : `<span class="t-op-icono">${icono(o.icono)}</span>`;
      return `<button type="button" class="t-op${marcada ? ' marcada' : ''}" data-valor="${esc(o.id)}"
          aria-pressed="${marcada}">
          ${visual}
          <span class="t-op-texto">
            <span class="t-op-titulo">${esc(o.texto)}</span>
            ${o.detalle ? `<span class="t-op-detalle">${esc(o.detalle)}</span>` : ''}
          </span>
          <span class="t-op-check">${icono('check')}</span>
        </button>`;
    }).join('');

    const seccion = $('#tPregunta');
    seccion.innerHTML = `
      <div class="t-pregunta-caja">
        <p class="t-antetitulo">${indice + 1 === total ? 'Última pregunta' : `Pregunta ${indice + 1}`}</p>
        <h2 class="t-pregunta-titulo" id="tTituloPregunta">${esc(titulo)}</h2>
        ${pregunta.ayuda ? `<p class="t-ayuda">${icono('idea')}<span>${esc(pregunta.ayuda)}</span></p>` : ''}
        <div class="t-opciones t-opciones-${modo}" role="group" aria-labelledby="tTituloPregunta">${opciones}</div>
        <div class="t-pregunta-pie">
          <button type="button" class="t-btn t-btn-fantasma" data-accion="atras">${icono('atras')} Atrás</button>
          ${pregunta.omitible
            ? '<button type="button" class="t-enlace" data-accion="omitir">Prefiero omitir esta pregunta</button>'
            : ''}
        </div>
      </div>`;

    mostrar('tPregunta', direccion);
    enfocar($('#tTituloPregunta'));
    guardarSesion('pregunta', pregunta.id);

    seccion.querySelectorAll('.t-op').forEach((boton) => {
      boton.addEventListener('click', () => responder(pregunta, boton.dataset.valor, boton));
    });
    seccion.querySelector('[data-accion="atras"]').addEventListener('click', () => history.back());
    const omitir = seccion.querySelector('[data-accion="omitir"]');
    if (omitir) omitir.addEventListener('click', () => responder(pregunta, null));
  }

  let avanzando = false;

  function responder(pregunta, valor, boton) {
    if (avanzando) return;
    avanzando = true;
    estado.respuestas[pregunta.id] = valor;

    const lista = visibles();
    medir('test_respuesta', {
      pregunta: pregunta.id,
      respuesta: valor == null ? 'omitida' : valor,
      paso: lista.findIndex((p) => p.id === pregunta.id) + 1,
    });

    if (boton) {
      $('#tPregunta').querySelectorAll('.t-op').forEach((b) => {
        const es = b === boton;
        b.classList.toggle('marcada', es);
        b.setAttribute('aria-pressed', String(es));
      });
    }

    // Una pausa corta para que se vea la elección antes de cambiar de pantalla.
    setTimeout(() => {
      avanzando = false;
      // La lista se recalcula: esta respuesta puede sumar o quitar preguntas.
      const nueva = visibles();
      const i = nueva.findIndex((p) => p.id === pregunta.id);
      const siguiente = nueva[i + 1];
      if (siguiente) {
        empujar({ t: 'p', id: siguiente.id });
        pintarPregunta(siguiente.id);
      } else {
        terminar();
      }
    }, boton ? 260 : 0);
  }

  /* --- Resultados ---------------------------------------------------------- */

  function calcular() {
    const efectivas = M.respuestasEfectivas(estado.config, estado.respuestas);
    estado.resultado = M.recomendar(estado.productos, efectivas, estado.config);
    estado.efectivas = efectivas;
    return estado.resultado;
  }

  function terminar() {
    medir('test_completado', { preguntas: visibles().length });
    mostrar('tCargando');
    calcular();
    // Un respiro breve: un resultado instantáneo se siente menos pensado.
    const espera = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 900;
    setTimeout(() => {
      empujar({ t: 'r' });
      pintarResultados();
    }, espera);
  }

  function explicacion(res) {
    const t = estado.config.textos;
    const luzTexto = (id) => M.textoOpcion(estado.config, 'luz', id).toLowerCase();
    switch (res.estado) {
      case 'luz-alternativa':
        return t.luzAlternativa
          .replace('{luz}', luzTexto(estado.efectivas.luz))
          .replace('{alternativa}', luzTexto(res.luzAlternativa));
      case 'fuera-presupuesto': return t.fueraPresupuesto;
      case 'parcial': return t.parcial;
      case 'pocos': return t.pocos;
      case 'sin-compatibles': return t.sinCompatibles;
      default:
        return estado.efectivas.luz === 'nose' || !estado.efectivas.luz ? t.luzDudosa : t.exacto;
    }
  }

  function tituloResultados(res) {
    const t = estado.config.textos;
    const n = res.resultados.length;
    // «Podrían enamorarte» no es honesto si ninguno cumple lo que pidió.
    if ((res.estado === 'luz-alternativa' || res.estado === 'fuera-presupuesto') && t.tituloAlternativas) {
      return t.tituloAlternativas;
    }
    return n >= 3 ? t.titulo3 : n === 2 ? t.titulo2 : t.titulo1;
  }

  /* Las respuestas en pastillas, para que la persona vea en qué se basó el
     resultado. Solo lo que contestó, no lo deducido. */
  function pastillas() {
    return visibles()
      .filter((p) => estado.respuestas[p.id])
      .map((p) => `<li>${esc(M.textoOpcion(estado.config, p.id, estado.respuestas[p.id]))}</li>`)
      .join('');
  }

  /* Solo lo que la persona contestó de verdad: al chat no tiene que llegar
     «tamaño: pequeño» como si lo hubiera dicho, si lo dedujimos nosotros. */
  function contestadas() {
    const r = {};
    visibles().forEach((p) => {
      if (estado.respuestas[p.id] != null) r[p.id] = estado.respuestas[p.id];
    });
    return r;
  }

  function enlaceWa(seleccionado) {
    const texto = M.mensajeWhatsApp(estado.config, estado.resultado, contestadas(), seleccionado);
    return M.enlaceWhatsApp(estado.config.whatsapp, texto);
  }

  function datoTamano(p) {
    const nombres = { pequeno: 'pequeño', mediano: 'mediano', grande: 'grande' };
    return [p.item.altura, nombres[p.tamano]].filter(Boolean).join(' · ');
  }

  function tarjeta(c, i, res) {
    const p = c.producto;
    const perfil = p.perfil;
    const dificultad = (estado.config.dificultades || {})[perfil.dificultad] || '';
    let etiqueta = '';
    if (i === 0 && !c.alternativa && res.estado !== 'luz-alternativa') {
      etiqueta = `<span class="t-etiqueta">${esc(estado.config.textos.etiquetaPrimero)}</span>`;
    } else if (c.alternativa) {
      etiqueta = '<span class="t-etiqueta t-etiqueta-suave">Alternativa cercana</span>';
    }

    const razones = c.razones.slice(0, 4).map((r) => `<li>${icono('check')}<span>${esc(r)}</span></li>`).join('');
    const avisos = [c.condicionLuz].concat(c.avisos).filter(Boolean)
      .map((a) => `<li>${icono('aviso')}<span>${esc(a)}</span></li>`).join('');

    return `<article class="t-tarjeta${i === 0 && !c.alternativa ? ' destacada' : ''}" style="--i:${i}">
      <div class="t-tarjeta-foto">
        <img src="${esc(p.item.imagen)}" alt="${esc(p.item.nombre)}" loading="${i === 0 ? 'eager' : 'lazy'}"
          width="600" height="600">
        ${etiqueta}
      </div>
      <div class="t-tarjeta-cuerpo">
        <h2 class="t-tarjeta-nombre">${esc(p.item.nombre)}</h2>
        <p class="t-tarjeta-meta"><strong>${esc(p.item.precio)}</strong><span>${esc(datoTamano(p))}</span></p>
        <p class="t-tarjeta-desc">${esc(p.item.descripcion)}</p>
        ${razones ? `<h3 class="t-mini">Por qué encaja contigo</h3><ul class="t-razones">${razones}</ul>` : ''}
        ${avisos ? `<ul class="t-avisos">${avisos}</ul>` : ''}
        <dl class="t-datos">
          ${dificultad ? `<div><dt>Cuidado</dt><dd>${esc(dificultad)}</dd></div>` : ''}
          ${perfil.ubicacionTexto ? `<div><dt>Dónde ponerlo</dt><dd>${esc(perfil.ubicacionTexto)}</dd></div>` : ''}
        </dl>
        <div class="t-tarjeta-acciones">
          <button type="button" class="t-btn t-btn-secundario" data-detalle="${esc(p.id)}" data-pos="${i + 1}">Ver detalles</button>
          <a class="t-btn t-btn-wa" href="${esc(enlaceWa(p))}" target="_blank" rel="noopener"
            data-wa="${esc(p.id)}" data-pos="${i + 1}">${WHATSAPP_SVG} Consultar por WhatsApp</a>
        </div>
      </div>
    </article>`;
  }

  function pintarResultados() {
    if (!estado.resultado) calcular();
    const res = estado.resultado;
    const n = res.resultados.length;
    const seccion = $('#tResultados');

    let cuerpo;
    if (!n) {
      cuerpo = `
        <div class="t-vacio">
          <div class="t-vacio-icono">${icono('idea')}</div>
          <p>${esc(estado.config.textos.sinCompatibles)}</p>
          <a class="t-btn t-btn-wa t-btn-grande" href="${esc(enlaceWa())}" target="_blank" rel="noopener"
            data-wa="ninguno">${WHATSAPP_SVG} Pedir ayuda por WhatsApp</a>
        </div>`;
    } else {
      cuerpo = `<div class="t-tarjetas t-tarjetas-${n}">${res.resultados.map((c, i) => tarjeta(c, i, res)).join('')}</div>`;
    }

    seccion.innerHTML = `
      <header class="t-res-cabecera">
        <p class="t-antetitulo">Tu resultado</p>
        <h1 id="tTituloResultados">${esc(n ? tituloResultados(res) : 'Busquemos juntos tu bonsái')}</h1>
        ${n ? `<p class="t-res-intro">${esc(explicacion(res))}</p>` : ''}
        <div class="t-res-respuestas">
          <ul class="t-pastillas" aria-label="Tus respuestas">${pastillas()}</ul>
          <button type="button" class="t-enlace" data-accion="cambiar">Cambiar</button>
        </div>
      </header>
      ${cuerpo}
      <div class="t-res-acciones">
        ${n > 1 ? `<a class="t-btn t-btn-wa t-btn-grande" href="${esc(enlaceWa())}" target="_blank" rel="noopener"
          data-wa="todos">${WHATSAPP_SVG} Ver los ${n} por WhatsApp</a>` : ''}
        <div class="t-res-secundarias">
          <button type="button" class="t-btn t-btn-fantasma" data-accion="cambiar">Volver a cambiar mis respuestas</button>
          <button type="button" class="t-btn t-btn-fantasma" data-accion="repetir">Repetir test</button>
        </div>
      </div>
      <p class="t-nota">${esc(estado.config.textos.notaPrecios)}</p>`;

    mostrar('tResultados');
    enfocar($('#tTituloResultados'));
    guardarSesion('resultados');

    medir('test_resultados', {
      estado: res.estado,
      cantidad: n,
      productos: res.resultados.map((c) => c.producto.id).join(','),
    });

    seccion.querySelectorAll('[data-accion="cambiar"]').forEach((b) =>
      b.addEventListener('click', cambiarRespuestas));
    seccion.querySelector('[data-accion="repetir"]').addEventListener('click', repetir);
    seccion.querySelectorAll('[data-detalle]').forEach((b) =>
      b.addEventListener('click', () => abrirDetalle(b.dataset.detalle, Number(b.dataset.pos))));
    seccion.querySelectorAll('[data-wa]').forEach((a) =>
      a.addEventListener('click', () => clicWhatsApp(a.dataset.wa, Number(a.dataset.pos) || 0)));
  }

  function clicWhatsApp(producto, posicion) {
    medir('test_whatsapp_click', {
      producto,
      posicion,
      estado: estado.resultado ? estado.resultado.estado : '',
    });
  }

  function cambiarRespuestas() {
    const primera = visibles()[0];
    empujar({ t: 'p', id: primera.id });
    pintarPregunta(primera.id);
  }

  function repetir() {
    estado.respuestas = {};
    estado.resultado = null;
    borrarSesion();
    medir('test_inicio', { repetido: true });
    const primera = visibles()[0];
    empujar({ t: 'p', id: primera.id });
    pintarPregunta(primera.id);
  }

  /* --- Detalle ------------------------------------------------------------- */

  function abrirDetalle(id, posicion) {
    const c = estado.resultado.resultados.find((x) => x.producto.id === id);
    if (!c) return;
    const p = c.producto;
    const perfil = p.perfil;
    const ficha = estado.paginas[p.id];
    const dificultad = (estado.config.dificultades || {})[perfil.dificultad] || '';
    const filas = [
      ['Precio de referencia', p.item.precio],
      ['Tamaño', datoTamano(p)],
      ['Edad', p.item.edad],
      ['Especie', p.item.especie],
      ['Cuidado', dificultad],
      ['Luz que necesita', perfil.luzTexto],
      ['Riego', perfil.riego],
      ['Dónde ponerlo', perfil.ubicacionTexto],
    ].filter(([, v]) => v);

    $('#tDetalleCaja').innerHTML = `
      <button type="button" class="t-detalle-cerrar" data-accion="cerrar" aria-label="Cerrar">${icono('cerrar')}</button>
      <div class="t-detalle-foto"><img src="${esc(p.item.imagen)}" alt="${esc(p.item.nombre)}" width="800" height="800"></div>
      <div class="t-detalle-cuerpo">
        <h2 id="tDetalleNombre">${esc(p.item.nombre)}</h2>
        <p class="t-detalle-desc">${esc(p.item.descripcion)}</p>
        <dl class="t-detalle-tabla">${filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <p class="t-nota">${esc(estado.config.textos.notaPrecios)}</p>
        <div class="t-detalle-acciones">
          <a class="t-btn t-btn-wa t-btn-grande" href="${esc(enlaceWa(p))}" target="_blank" rel="noopener"
            data-wa-detalle>${WHATSAPP_SVG} Consultar por WhatsApp</a>
          ${ficha ? `<a class="t-btn t-btn-secundario" href="${esc(ficha)}" data-ficha>Ver ficha completa</a>` : ''}
        </div>
      </div>`;

    const dialogo = $('#tDetalle');
    dialogo.querySelector('[data-accion="cerrar"]').addEventListener('click', () => dialogo.close());
    dialogo.querySelector('[data-wa-detalle]').addEventListener('click', () => clicWhatsApp(p.id, posicion));
    const enlaceFicha = dialogo.querySelector('[data-ficha]');
    if (enlaceFicha) {
      enlaceFicha.addEventListener('click', () =>
        medir('test_producto_click', { producto: p.id, posicion, accion: 'ficha' }));
    }
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
    medir('test_producto_click', { producto: p.id, posicion, accion: 'detalles' });
  }

  // Tocar fuera de la caja cierra el detalle, como cualquier hoja en el móvil.
  $('#tDetalle').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });

  /* --- Arranque ------------------------------------------------------------ */

  async function leerJSON(url, opcional) {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return await res.json();
    } catch (e) {
      if (opcional) return {};
      throw e;
    }
  }

  let cargando = null;

  function cargarDatos() {
    if (!cargando) {
      cargando = Promise.all([
        leerJSON('data/test-bonsai.json'),
        leerJSON('data/catalog.json'),
        leerJSON('data/paginas.json', true),
      ]).then(([config, catalogo, paginas]) => {
        estado.config = config;
        estado.productos = M.prepararProductos(catalogo, config);
        estado.paginas = paginas || {};
        const aviso = $('#tRevision');
        if (config.modoRevision && config.textos && config.textos.revision) {
          aviso.textContent = config.textos.revision;
          aviso.hidden = false;
        }
      }).catch((e) => {
        cargando = null;
        throw e;
      });
    }
    return cargando;
  }

  function error(e) {
    console.error(e);
    mostrar('tError');
  }

  function empezar(continuar) {
    const sesion = leerSesion();
    if (continuar && sesion) {
      estado.respuestas = sesion.respuestas;
      if (sesion.pantalla === 'resultados') {
        empujar({ t: 'r' });
        pintarResultados();
        return;
      }
      const id = sesion.preguntaId || visibles()[0].id;
      empujar({ t: 'p', id });
      pintarPregunta(id);
      return;
    }
    estado.respuestas = {};
    estado.resultado = null;
    borrarSesion();
    medir('test_inicio', { repetido: false });
    const primera = visibles()[0];
    empujar({ t: 'p', id: primera.id });
    pintarPregunta(primera.id);
  }

  function alPulsar(boton, continuar) {
    boton.addEventListener('click', () => {
      if (estado.config) { empezar(continuar); return; }
      mostrar('tCargando');
      cargarDatos().then(() => empezar(continuar)).catch(error);
    });
  }

  alPulsar($('#tEmpezar'), false);
  alPulsar($('#tContinuar'), true);
  $('#tReintentar').addEventListener('click', () => {
    mostrar('tCargando');
    cargarDatos().then(() => {
      reemplazar(null);
      pintarInicio();
    }).catch(error);
  });

  cargarDatos().then(() => {
    // Recarga en mitad del test: history.state dice dónde estaba.
    const s = history.state;
    const sesion = leerSesion();
    if (s && s.t && sesion) {
      estado.respuestas = sesion.respuestas;
      if (s.t === 'r') pintarResultados();
      else pintarPregunta(s.id);
      return;
    }
    if (document.body.dataset.pantalla && document.body.dataset.pantalla !== 'tInicio') return;
    pintarInicio();
  }).catch((e) => {
    // Si la persona todavía no pulsó nada, el error se enseña al pulsar.
    console.warn('No se pudieron cargar los datos del test', e);
    if (document.body.dataset.pantalla && document.body.dataset.pantalla !== 'tInicio') error(e);
  });
})();
