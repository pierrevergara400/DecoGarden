/* ==========================================================================
   panel.js — la lógica del panel de /admin.

   Trabaja sobre una copia en memoria de catalog.json y blog.json. Nada se
   escribe en disco hasta que pulsas "Guardar cambios", y nada llega al sitio
   hasta "Publicar al sitio", que es lo que corre los generadores. Esa separación
   es a propósito: editar y publicar son dos decisiones distintas, y mezclarlas
   convierte cualquier tecla mal pulsada en un cambio en producción.
   ========================================================================== */

const $ = (sel) => document.querySelector(sel);

const CATEGORIAS = [
  ['entrada', 'Para empezar'],
  ['coleccion', 'De colección'],
];

// Los badges que entiende el catálogo. La clase decide el color de la etiqueta
// en la tarjeta; el texto es lo que se lee. app.js trata "vendido" y "reservado"
// como fuera de stock en los datos estructurados, así que el texto importa.
const BADGES = [
  ['ok', 'Disponible'],
  ['last', 'Última pieza'],
  ['soft', 'Reservado'],
  ['soft', 'Vendido'],
];

let catalogo = [];
let posts = [];
let test = null; // test-bonsai.json entero; null si todavía no existe
let tomasEsperadas = [];
let abiertos = new Set();
let sucio = false;

/* --- Utilidades ---------------------------------------------------------- */

function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function aviso(texto, esError = false) {
  const caja = $('#adEstado');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
}

function marcarSucio() {
  sucio = true;
  $('#adGuardar').disabled = false;
  aviso('Cambios sin guardar');
}

/* Un slug legible y estable: es la URL del artículo, y cambiarla después
   rompe cualquier enlace que ya se haya compartido. */
function aSlug(texto) {
  return String(texto).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

async function api(metodo, ruta, cuerpo) {
  const res = await fetch(ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

/* --- Campos -------------------------------------------------------------- */

function campo(objeto, clave, etiqueta, opciones = {}) {
  const { tipo = 'text', ancho = false, pista = '', filas = 0, lista = null } = opciones;
  const valor = objeto[clave] ?? '';
  const id = `c-${Math.random().toString(36).slice(2, 9)}`;
  let control;

  if (lista) {
    const ops = lista.map(([v, t]) =>
      `<option value="${esc(v)}"${v === valor ? ' selected' : ''}>${esc(t)}</option>`
    ).join('');
    control = `<select id="${id}" data-clave="${esc(clave)}">${ops}</select>`;
  } else if (filas) {
    control = `<textarea id="${id}" data-clave="${esc(clave)}" rows="${filas}"${
      opciones.mono ? ' class="cuerpo"' : ''}>${esc(valor)}</textarea>`;
  } else {
    control = `<input id="${id}" type="${tipo}" data-clave="${esc(clave)}" value="${esc(valor)}">`;
  }

  return `<div class="ad-campo${ancho ? ' ancho' : ''}">
      <label for="${id}">${esc(etiqueta)}${pista ? ` <span class="pista">${esc(pista)}</span>` : ''}</label>
      ${control}
    </div>`;
}

/* Enlaza los campos de un detalle con su objeto. Escribe directo sobre el dato
   y no repinta: repintar mientras escribes te robaría el cursor a cada tecla. */
function enlazar(contenedor, objeto, alCambiar) {
  contenedor.querySelectorAll('[data-clave]').forEach((control) => {
    control.addEventListener('input', () => {
      objeto[control.dataset.clave] = control.value;
      marcarSucio();
      if (alCambiar) alCambiar(control);
    });
  });
}

/* --- Productos ----------------------------------------------------------- */

function marcasDe(p) {
  const marcas = [];
  if (!p.activo) marcas.push(['ad-marca-neutra', 'Apagado']);
  if (!p.tieneFicha) marcas.push(['ad-marca-alerta', 'Sin ficha propia']);
  const faltan = p.fotos?.faltan?.length ?? 0;
  if (!p.fotos?.existe) marcas.push(['ad-marca-falta', 'Sin fotos']);
  else if (faltan) marcas.push(['ad-marca-alerta', `Faltan ${faltan} tomas`]);
  else marcas.push(['ad-marca-ok', 'Fotos completas']);
  return marcas;
}

function tienePendiente(p) {
  return !p.tieneFicha || !p.fotos?.existe || (p.fotos?.faltan?.length ?? 0) > 0;
}

function detalleProducto(p) {
  return `<div class="ad-detalle">
    <div class="ad-campos">
      ${campo(p, 'nombre', 'Nombre', { ancho: true })}
      ${campo(p, 'especie', 'Especie')}
      ${campo(p, 'altura', 'Altura', { pista: 'ej. 30 cm' })}
      ${campo(p, 'edad', 'Edad', { pista: 'ej. 10 años' })}
      ${campo(p, 'categoria', 'Categoría', { lista: CATEGORIAS })}
      ${campo(p, 'precio', 'Precio', { pista: 'con el $' })}
      ${campo(p, 'detallePrecio', 'Bajo el precio')}
      ${campo(p, 'badgeTexto', 'Etiqueta', { lista: BADGES.map(([, t]) => [t, t]) })}
      ${campo(p, 'badgeClass', 'Color de la etiqueta', {
        lista: [['ok', 'Verde (disponible)'], ['last', 'Ámbar (última pieza)'], ['soft', 'Gris (reservado o vendido)']],
      })}
      ${campo(p, 'imagen', 'Foto del catálogo', { ancho: true, pista: 'ruta dentro del proyecto' })}
      ${campo(p, 'descripcion', 'Descripción de la tarjeta', { ancho: true, filas: 4 })}
      ${campo(p, 'whatsappMsg', 'Mensaje de WhatsApp', { ancho: true, filas: 2, pista: 'sin tildes: va en una URL' })}
    </div>
    <p class="ad-ruta">id: ${esc(p.id)} — no se puede cambiar sin renombrar también su carpeta de fotos, su entrada en productos.json y su ficha.</p>
  </div>`;
}

function pintarProductos() {
  const contenedor = $('#adProductos');
  const busqueda = $('#adBuscar').value.trim().toLowerCase();
  const soloProblemas = $('#adSoloProblemas').checked;

  const visibles = catalogo.filter((p) => {
    if (soloProblemas && !tienePendiente(p)) return false;
    if (!busqueda) return true;
    return `${p.nombre} ${p.id} ${p.especie || ''}`.toLowerCase().includes(busqueda);
  });

  $('#adCuentaProductos').textContent = `${catalogo.filter((p) => p.activo).length}/${catalogo.length}`;

  if (!visibles.length) {
    contenedor.innerHTML = '<p class="ad-vacio">Ningún producto coincide con ese filtro.</p>';
    return;
  }

  contenedor.innerHTML = visibles.map((p) => {
    const abierto = abiertos.has(p.id);
    const marcas = marcasDe(p).map(([clase, texto]) =>
      `<span class="ad-marca-estado ${clase}">${esc(texto)}</span>`).join('');
    return `<article class="ad-item${p.activo ? '' : ' apagado'}" data-id="${esc(p.id)}">
      <div class="ad-item-cabecera">
        <label class="ad-switch" title="${p.activo ? 'Quitar del sitio' : 'Publicar en el sitio'}">
          <input type="checkbox" data-accion="activo" aria-label="Publicar ${esc(p.nombre)} en el sitio"${p.activo ? ' checked' : ''}>
          <span class="ad-switch-pista"></span>
        </label>
        <img class="ad-item-mini" src="${esc(p.imagen)}" alt="" loading="lazy">
        <div class="ad-item-texto">
          <span class="ad-item-nombre">${esc(p.nombre)} · ${esc(p.precio)}</span>
          <div class="ad-item-sub"><span class="ad-id">${esc(p.id)}</span>${marcas}</div>
        </div>
        <button type="button" class="ad-desplegar" data-accion="abrir">${abierto ? 'Cerrar' : 'Editar'}</button>
      </div>
      ${abierto ? detalleProducto(p) : ''}
    </article>`;
  }).join('');

  contenedor.querySelectorAll('.ad-item').forEach((tarjeta) => {
    const p = catalogo.find((x) => x.id === tarjeta.dataset.id);

    tarjeta.querySelector('[data-accion="activo"]').addEventListener('change', (e) => {
      p.activo = e.target.checked;
      marcarSucio();
      pintarProductos();
      pintarTest();
    });

    tarjeta.querySelector('[data-accion="abrir"]').addEventListener('click', () => {
      if (abiertos.has(p.id)) abiertos.delete(p.id); else abiertos.add(p.id);
      pintarProductos();
    });

    const detalle = tarjeta.querySelector('.ad-detalle');
    if (detalle) enlazar(detalle, p);
  });
}

/* --- Fotos --------------------------------------------------------------- */

function pintarFotos() {
  const pendientes = catalogo.filter(tienePendiente);
  $('#adCuentaFotos').textContent = pendientes.length || '';

  const contenedor = $('#adFotos');
  if (!catalogo.length) {
    contenedor.innerHTML = '<p class="ad-vacio">No hay productos en el catálogo.</p>';
    return;
  }

  // Primero lo que falta: el panel existe para enseñar el trabajo pendiente,
  // no para felicitarte por lo que ya está hecho.
  const orden = [...catalogo].sort((a, b) =>
    (b.fotos?.faltan?.length ?? 0) - (a.fotos?.faltan?.length ?? 0));

  contenedor.innerHTML = orden.map((p) => {
    const f = p.fotos || { tiene: [], faltan: tomasEsperadas, existe: false, fotos: 0, videos: 0 };
    const tomas = tomasEsperadas.map((t) => {
      const tiene = f.tiene.includes(t);
      return `<span class="ad-toma ${tiene ? 'si' : 'no'}">${tiene ? '✓' : '○'} ${esc(t)}</span>`;
    }).join('');
    const extra = f.sueltas?.length
      ? `<p class="ad-ruta">Además: ${esc(f.sueltas.join(', '))}</p>` : '';
    return `<article class="ad-item${p.activo ? '' : ' apagado'}">
      <div class="ad-item-cabecera">
        <img class="ad-item-mini" src="${esc(p.imagen)}" alt="" loading="lazy">
        <div class="ad-item-texto">
          <span class="ad-item-nombre">${esc(p.nombre)}</span>
          <div class="ad-item-sub">
            <span class="ad-id">${f.fotos} foto(s)${f.videos ? `, ${f.videos} video(s)` : ''}</span>
            ${f.faltan.length
              ? `<span class="ad-marca-estado ad-marca-alerta">Faltan ${f.faltan.length}</span>`
              : '<span class="ad-marca-estado ad-marca-ok">Completo</span>'}
            ${p.tieneFicha ? '' : '<span class="ad-marca-estado ad-marca-falta">Sin ficha</span>'}
          </div>
        </div>
      </div>
      <div class="ad-fotos-cuerpo">
        <div class="ad-tomas">${tomas}</div>
        <p class="ad-ruta">${esc(f.carpeta)}${f.existe ? '' : '  (la carpeta todavía no existe)'}</p>
        ${extra}
      </div>
    </article>`;
  }).join('');
}

/* --- Blog ---------------------------------------------------------------- */

/* El titular de la página es un par: la segunda mitad va en cursiva, igual que
   en las fichas de producto. Se guarda como lista porque así lo lee la
   plantilla; vacío, el titular sigue al título y no se queda desfasado. */
function campoTitular(post) {
  const [uno = '', dos = ''] = post.h1 || [];
  return `<div class="ad-campo ancho">
      <label>Titular de la página <span class="pista">déjalo vacío y usa el título; la segunda parte sale en cursiva</span></label>
      <div style="display:flex;gap:10px">
        <input data-h1="0" value="${esc(uno)}" placeholder="Cada cuánto regar un bonsái">
        <input data-h1="1" value="${esc(dos)}" placeholder="y por qué no tiene respuesta">
      </div>
    </div>`;
}

/* Las etiquetas son una lista en el JSON pero se escriben como texto
   separado por comas: es la forma en que uno las piensa al teclearlas. */
function campoEtiquetas(post) {
  const id = `c-${Math.random().toString(36).slice(2, 9)}`;
  return `<div class="ad-campo">
      <label for="${id}">Etiquetas <span class="pista">separadas por comas</span></label>
      <input id="${id}" data-etiquetas value="${esc((post.tags || []).join(', '))}">
    </div>`;
}

function detallePost(post) {
  return `<div class="ad-detalle">
    <div class="ad-campos">
      ${campo(post, 'titulo', 'Título', { ancho: true })}
      ${campo(post, 'slug', 'Slug', { pista: 'la URL: /blog-<slug>' })}
      ${campo(post, 'fecha', 'Fecha', { tipo: 'date' })}
      ${campoTitular(post)}
      ${campo(post, 'tituloSeo', 'Título para Google', { ancho: true, pista: 'hasta ~60 letras; si lo dejas vacío se usa el título' })}
      ${campo(post, 'metaDescripcion', 'Descripción para Google', { ancho: true, filas: 2, pista: 'hasta ~155 letras' })}
      ${campo(post, 'resumen', 'Entradilla', { ancho: true, filas: 3, pista: 'se lee bajo el título y en la tarjeta del índice' })}
      ${campo(post, 'portada', 'Portada', { pista: 'ruta de la imagen, opcional' })}
      ${campoEtiquetas(post)}
      ${campo(post, 'portadaAlt', 'Texto alternativo de la portada')}
      ${campo(post, 'cuerpo', 'Cuerpo del artículo', {
        ancho: true, filas: 22, mono: true,
        pista: '## subtítulo · - lista · **negrita** · [texto](enlace) · > cita',
      })}
    </div>
    <div class="ad-pie-detalle">
      <button type="button" class="ad-btn ad-btn-peligro" data-accion="borrar">Eliminar artículo</button>
    </div>
  </div>`;
}

function pintarBlog() {
  const contenedor = $('#adBlog');
  $('#adCuentaBlog').textContent = `${posts.filter((p) => !p.borrador).length}/${posts.length}`;

  if (!posts.length) {
    contenedor.innerHTML = '<p class="ad-vacio">Todavía no hay artículos. Empieza con «Artículo nuevo».</p>';
    return;
  }

  const orden = [...posts].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  contenedor.innerHTML = orden.map((post) => {
    const abierto = abiertos.has('post:' + post.slug);
    const publicado = !post.borrador;
    return `<article class="ad-item${publicado ? '' : ' apagado'}" data-slug="${esc(post.slug)}">
      <div class="ad-item-cabecera">
        <label class="ad-switch" title="${publicado ? 'Pasar a borrador' : 'Publicar'}">
          <input type="checkbox" data-accion="publicado" aria-label="Publicar ${esc(post.titulo || post.slug)}"${publicado ? ' checked' : ''}>
          <span class="ad-switch-pista"></span>
        </label>
        <div class="ad-item-texto">
          <span class="ad-item-nombre">${esc(post.titulo || 'Sin título')}</span>
          <div class="ad-item-sub">
            <span class="ad-id">${esc(post.fecha || 'sin fecha')} · /blog-${esc(post.slug)}</span>
            ${publicado
              ? '<span class="ad-marca-estado ad-marca-ok">Publicado</span>'
              : '<span class="ad-marca-estado ad-marca-neutra">Borrador</span>'}
          </div>
        </div>
        <button type="button" class="ad-desplegar" data-accion="abrir">${abierto ? 'Cerrar' : 'Editar'}</button>
      </div>
      ${abierto ? detallePost(post) : ''}
    </article>`;
  }).join('');

  contenedor.querySelectorAll('.ad-item').forEach((tarjeta) => {
    const post = posts.find((x) => x.slug === tarjeta.dataset.slug);

    tarjeta.querySelector('[data-accion="publicado"]').addEventListener('change', (e) => {
      post.borrador = !e.target.checked;
      marcarSucio();
      pintarBlog();
    });

    tarjeta.querySelector('[data-accion="abrir"]').addEventListener('click', () => {
      const clave = 'post:' + post.slug;
      if (abiertos.has(clave)) abiertos.delete(clave); else abiertos.add(clave);
      pintarBlog();
    });

    const detalle = tarjeta.querySelector('.ad-detalle');
    if (!detalle) return;

    // El slug identifica la tarjeta abierta; si cambia mientras escribes hay
    // que mover la marca, o el detalle se cerraría solo al repintar.
    detalle.querySelectorAll('[data-h1]').forEach((control) => {
      control.addEventListener('input', () => {
        const partes = [...detalle.querySelectorAll('[data-h1]')].map((c) => c.value.trim());
        // Una lista con un hueco al principio daría un titular vacío; si no hay
        // primera parte no hay titular, y la plantilla cae en el título.
        post.h1 = partes[0] ? partes.filter(Boolean) : undefined;
        post.actualizado = hoy();
        marcarSucio();
      });
    });

    const etiquetas = detalle.querySelector('[data-etiquetas]');
    etiquetas.addEventListener('input', () => {
      post.tags = etiquetas.value.split(',').map((t) => t.trim()).filter(Boolean);
      post.actualizado = hoy();
      marcarSucio();
    });

    enlazar(detalle, post, (control) => {
      // dateModified le dice a Google que el artículo se revisó; mentirle es
      // peor que no ponerlo, así que se sella solo cuando de verdad editas.
      post.actualizado = hoy();
      if (control.dataset.clave === 'slug') {
        abiertos.delete(tarjeta.dataset.slug ? 'post:' + tarjeta.dataset.slug : '');
        abiertos.add('post:' + post.slug);
        tarjeta.dataset.slug = post.slug;
      }
    });

    detalle.querySelector('[data-accion="borrar"]').addEventListener('click', () => {
      if (!confirm(`¿Eliminar «${post.titulo}»?\n\nSe borra del panel al guardar, y su página sale del sitio al publicar. Si solo quieres esconderlo, pásalo a borrador con el interruptor.`)) return;
      posts = posts.filter((x) => x !== post);
      abiertos.delete('post:' + post.slug);
      marcarSucio();
      pintarBlog();
    });
  });
}

/* --- Test de bonsái ------------------------------------------------------ */

/* Qué listas del perfil se marcan con casillas, y de qué pregunta del test
   salen sus opciones. Así los textos del panel son los mismos que ve el
   cliente, y no hay forma de escribir una luz que el test no conozca. */
const GRUPOS_PERFIL = [
  ['luz', 'luz', 'Luz con la que vive bien (filtro)', 'filtro'],
  ['lugares', 'lugar', 'Dónde encaja'],
  ['estilos', 'estilo', 'Estilos'],
  ['usos', 'para', 'Para quién'],
  ['ocasiones', 'ocasion', 'Ocasiones (regalo)'],
  ['cuidado', 'cuidado', 'Tiempo de cuidado que acepta'],
];

const DIFICULTADES = [['facil', 'Fácil'], ['media', 'Intermedio'], ['avanzada', 'Avanzado']];

function opcionesDe(preguntaId) {
  const pregunta = (test?.preguntas || []).find((p) => p.id === preguntaId);
  return (pregunta?.opciones || []).filter((o) => o.id !== 'nose' && o.id !== 'sorpresa');
}

function perfilVacio() {
  return {
    validado: false, fuente: '', luz: [], lugares: [], estilos: [], usos: [],
    ocasiones: [], cuidado: [], dificultad: 'facil', luzTexto: '', ubicacionTexto: '', riego: '',
  };
}

function estadoPerfil(p) {
  const perfil = test?.perfiles?.[p.id];
  if (!perfil) return ['ad-marca-neutra', 'Fuera del test'];
  if (/vendido|reservado|agotado/i.test(p.badgeTexto || '') || perfil.stock === 'agotado') {
    return ['ad-marca-neutra', 'Agotado: no se recomienda'];
  }
  if (!perfil.validado) return ['ad-marca-alerta', 'Por validar'];
  return ['ad-marca-ok', 'Validado'];
}

function grupoCasillas(perfil, clave, preguntaId, titulo, clase = '') {
  const valores = perfil[clave] || [];
  // Sombra e interior sin sol no se ofrecen nunca: la casilla está, pero apagada.
  const prohibidas = clave === 'luz' ? (test?.lucesProhibidas || []) : [];
  const casillas = opcionesDe(preguntaId).map((o) => {
    const vetada = prohibidas.includes(o.id);
    return `<label class="ad-check"${vetada ? ' title="DecoGarden no recomienda bonsáis para esta luz"' : ''}>
      <input type="checkbox" data-lista="${esc(clave)}" value="${esc(o.id)}"${
        valores.includes(o.id) && !vetada ? ' checked' : ''}${vetada ? ' disabled' : ''}>
      ${esc(o.texto)}${vetada ? ' <span class="pista">(nunca)</span>' : ''}
    </label>`;
  }).join('');
  return `<fieldset class="ad-grupo ${clase}"><legend>${esc(titulo)}</legend>${casillas}</fieldset>`;
}

function detallePerfil(p, perfil) {
  return `<div class="ad-detalle">
    <div class="ad-grupos">
      ${GRUPOS_PERFIL.map(([clave, pregunta, titulo, clase]) => grupoCasillas(perfil, clave, pregunta, titulo, clase)).join('')}
    </div>
    <div class="ad-campos">
      ${campo(perfil, 'dificultad', 'Nivel de cuidado', { lista: DIFICULTADES })}
      ${campo(perfil, 'tamano', 'Tamaño', {
        lista: [['', `Según la altura (${p.altura || 'sin altura'})`], ['pequeno', 'Pequeño'], ['mediano', 'Mediano'], ['grande', 'Grande']],
      })}
      ${campo(perfil, 'stock', 'Disponibilidad en el test', {
        lista: [['', 'Según la etiqueta del catálogo'], ['agotado', 'Agotado: no recomendar']],
      })}
      ${campo(perfil, 'luzTexto', 'Luz, en palabras del cliente', { ancho: true, pista: 'sale tras «Necesita:» y en el detalle' })}
      ${campo(perfil, 'ubicacionTexto', 'Dónde ponerlo', { ancho: true })}
      ${campo(perfil, 'riego', 'Riego', { ancho: true })}
      ${campo(perfil, 'fuente', 'De dónde salen estos datos', { ancho: true, filas: 2, pista: 'nota interna, no sale en pantalla' })}
    </div>
    <label class="ad-validar${perfil.validado ? ' ok' : ''}">
      <input type="checkbox" data-validado${perfil.validado ? ' checked' : ''}>
      <span><strong>Validado por DecoGarden.</strong> Confirmo la luz, el cuidado y la ubicación de este bonsái.
        Con el modo revisión apagado, solo se recomiendan los validados.</span>
    </label>
    <div class="ad-pie-detalle">
      <button type="button" class="ad-btn ad-btn-peligro" data-accion="quitar">Sacar del test</button>
    </div>
  </div>`;
}

function pintarAjustesTest() {
  const caja = $('#adTestAjustes');
  if (!test) {
    caja.innerHTML = '<p class="ad-vacio">No se encontró public/data/test-bonsai.json.</p>';
    return;
  }
  test.analitica = test.analitica || {};
  caja.innerHTML = `
    <label class="ad-check">
      <input type="checkbox" id="adModoRevision"${test.modoRevision ? ' checked' : ''}>
      Modo revisión
    </label>
    <div class="ad-campo">
      <label for="adTestWa">WhatsApp <span class="pista">con 593, sin +</span></label>
      <input id="adTestWa" value="${esc(test.whatsapp || '')}" inputmode="numeric">
    </div>
    <div class="ad-campo">
      <label for="adTestGa4">GA4 <span class="pista">G-XXXXXXX, opcional</span></label>
      <input id="adTestGa4" value="${esc(test.analitica.ga4Id || '')}">
    </div>
    <p class="pista">Con el modo revisión encendido el test recomienda también los perfiles sin validar y lo avisa en
      pantalla. Apágalo al lanzar el test: desde ahí solo salen los validados.</p>`;

  $('#adModoRevision').addEventListener('change', (e) => { test.modoRevision = e.target.checked; marcarSucio(); });
  $('#adTestWa').addEventListener('input', (e) => { test.whatsapp = e.target.value.replace(/\D/g, ''); marcarSucio(); });
  $('#adTestGa4').addEventListener('input', (e) => { test.analitica.ga4Id = e.target.value.trim(); marcarSucio(); });
}

function pintarTest() {
  const contenedor = $('#adTest');
  if (!test) { contenedor.innerHTML = ''; return; }
  test.perfiles = test.perfiles || {};
  const soloPendientes = $('#adSoloSinValidar').checked;
  const pendientes = catalogo.filter((p) => test.perfiles[p.id] && !test.perfiles[p.id].validado);
  $('#adCuentaTest').textContent = pendientes.length || '';

  const visibles = catalogo.filter((p) => !soloPendientes || pendientes.includes(p));
  if (!visibles.length) {
    contenedor.innerHTML = '<p class="ad-vacio">Todos los perfiles están validados.</p>';
    return;
  }

  contenedor.innerHTML = visibles.map((p) => {
    const perfil = test.perfiles[p.id];
    const abierto = abiertos.has('test:' + p.id);
    const [clase, texto] = estadoPerfil(p);
    const boton = perfil
      ? `<button type="button" class="ad-desplegar" data-accion="abrir">${abierto ? 'Cerrar' : 'Editar'}</button>`
      : '<button type="button" class="ad-desplegar" data-accion="crear">Añadir al test</button>';
    return `<article class="ad-item${perfil && p.activo ? '' : ' apagado'}" data-id="${esc(p.id)}">
      <div class="ad-item-cabecera">
        <img class="ad-item-mini" src="${esc(p.imagen)}" alt="" loading="lazy">
        <div class="ad-item-texto">
          <span class="ad-item-nombre">${esc(p.nombre)} · ${esc(p.precio)}</span>
          <div class="ad-item-sub">
            <span class="ad-id">luz: ${esc((perfil?.luz || []).join(', ') || '—')}</span>
            <span class="ad-marca-estado ${clase}">${esc(texto)}</span>
            ${p.activo ? '' : '<span class="ad-marca-estado ad-marca-neutra">Apagado en el catálogo</span>'}
          </div>
        </div>
        ${boton}
      </div>
      ${perfil && abierto ? detallePerfil(p, perfil) : ''}
    </article>`;
  }).join('');

  contenedor.querySelectorAll('.ad-item').forEach((tarjeta) => {
    const p = catalogo.find((x) => x.id === tarjeta.dataset.id);
    const clave = 'test:' + p.id;

    tarjeta.querySelector('[data-accion="crear"]')?.addEventListener('click', () => {
      test.perfiles[p.id] = perfilVacio();
      abiertos.add(clave);
      marcarSucio();
      pintarTest();
    });

    tarjeta.querySelector('[data-accion="abrir"]')?.addEventListener('click', () => {
      if (abiertos.has(clave)) abiertos.delete(clave); else abiertos.add(clave);
      pintarTest();
    });

    const detalle = tarjeta.querySelector('.ad-detalle');
    if (!detalle) return;
    const perfil = test.perfiles[p.id];

    detalle.querySelectorAll('[data-lista]').forEach((casilla) => {
      casilla.addEventListener('change', () => {
        const lista = casilla.dataset.lista;
        perfil[lista] = [...detalle.querySelectorAll(`[data-lista="${lista}"]:checked`)].map((c) => c.value);
        // Cambiar la luz deshace la validación: alguien tiene que volver a
        // confirmarla, no heredar un «validado» que se dio con otros datos.
        if (lista === 'luz' && perfil.validado) {
          perfil.validado = false;
          detalle.querySelector('[data-validado]').checked = false;
          detalle.querySelector('.ad-validar').classList.remove('ok');
        }
        marcarSucio();
      });
    });

    detalle.querySelector('[data-validado]').addEventListener('change', (e) => {
      if (e.target.checked && !(perfil.luz || []).length) {
        e.target.checked = false;
        aviso('Marca al menos una luz antes de validar', true);
        return;
      }
      perfil.validado = e.target.checked;
      marcarSucio();
      pintarTest();
    });

    enlazar(detalle.querySelector('.ad-campos'), perfil, (control) => {
      // Un select vacío es «automático»: se borra la clave en vez de guardar
      // una cadena vacía que el motor tomaría por un valor.
      if (control.value === '' && (control.dataset.clave === 'tamano' || control.dataset.clave === 'stock')) {
        delete perfil[control.dataset.clave];
      }
    });

    detalle.querySelector('[data-accion="quitar"]').addEventListener('click', () => {
      if (!confirm(`¿Sacar «${p.nombre}» del test?\n\nNo se borra del catálogo: solo deja de recomendarse.`)) return;
      delete test.perfiles[p.id];
      abiertos.delete(clave);
      marcarSucio();
      pintarTest();
    });
  });
}

/* --- Guardar y publicar -------------------------------------------------- */

/* El catálogo se guarda como estaba, sin los campos que solo existen para
   pintar el panel: 'tieneFicha' y 'fotos' se calculan al vuelo y no tienen por
   qué ensuciar catalog.json. */
function catalogoParaGuardar() {
  return catalogo.map(({ tieneFicha, fotos, activo, ...resto }) =>
    (activo ? resto : { ...resto, activo: false }));
}

async function guardar() {
  $('#adGuardar').disabled = true;
  aviso('Guardando…');
  try {
    await api('PUT', '/api/catalogo', catalogoParaGuardar());
    await api('PUT', '/api/blog', { posts });
    if (test) await api('PUT', '/api/test', test);
    sucio = false;
    aviso('Guardado en catalog.json, blog.json y test-bonsai.json');
    return true;
  } catch (e) {
    $('#adGuardar').disabled = false;
    aviso(e.message, true);
    return false;
  }
}

async function publicar() {
  if (sucio && !await guardar()) return;

  const dialogo = $('#adDialogo');
  $('#adDialogoTitulo').textContent = 'Publicando…';
  $('#adRegistro').textContent = 'Corriendo generar_blog.py y generar_productos.py…';
  dialogo.showModal();

  try {
    const res = await api('POST', '/api/publicar');
    $('#adDialogoTitulo').textContent = res.ok ? 'Sitio regenerado' : 'Algo falló al generar';
    $('#adRegistro').textContent = res.registro;
    aviso(res.ok ? 'Sitio regenerado. Falta subirlo con git para que se vea en línea.' : 'La generación falló', !res.ok);
    if (res.ok) await cargar();
  } catch (e) {
    $('#adDialogoTitulo').textContent = 'Algo falló al generar';
    $('#adRegistro').textContent = e.message;
    aviso(e.message, true);
  }
}

/* --- Arranque ------------------------------------------------------------ */

async function cargar() {
  try {
    const datos = await api('GET', '/api/estado');
    catalogo = datos.productos;
    posts = datos.blog;
    tomasEsperadas = datos.tomasEsperadas;
    test = datos.test;
    sucio = false;
    $('#adGuardar').disabled = true;
    pintarProductos();
    pintarFotos();
    pintarBlog();
    pintarAjustesTest();
    pintarTest();
    aviso('Al día');
  } catch (e) {
    $('#adSinBackend').hidden = false;
    $('#adGuardar').disabled = true;
    $('#adPublicar').disabled = true;
    aviso('Sin conexión con el servidor local', true);
  }
}

$('#adBuscar').addEventListener('input', pintarProductos);
$('#adSoloProblemas').addEventListener('change', pintarProductos);
$('#adSoloSinValidar').addEventListener('change', pintarTest);
$('#adGuardar').addEventListener('click', guardar);
$('#adPublicar').addEventListener('click', publicar);

$('#adNuevoPost').addEventListener('click', () => {
  const titulo = prompt('Título del artículo');
  if (!titulo || !titulo.trim()) return;
  const base = aSlug(titulo);
  let slug = base;
  let n = 2;
  while (posts.some((p) => p.slug === slug)) slug = `${base}-${n++}`;

  posts.unshift({
    slug, titulo: titulo.trim(), tituloSeo: '',
    metaDescripcion: '', resumen: '', fecha: hoy(), actualizado: hoy(),
    tags: [], portada: '', portadaAlt: '',
    // Nace apagado: un artículo se publica cuando está escrito, no cuando se crea.
    borrador: true, cuerpo: '',
  });
  abiertos.add('post:' + slug);
  marcarSucio();
  document.querySelector('[data-panel="blog"]').click();
  pintarBlog();
});

document.querySelectorAll('.ad-pestana').forEach((boton) => {
  boton.addEventListener('click', () => {
    document.querySelectorAll('.ad-pestana').forEach((b) => {
      b.classList.toggle('activa', b === boton);
      b.setAttribute('aria-selected', String(b === boton));
    });
    document.querySelectorAll('.ad-panel').forEach((panel) => {
      panel.classList.toggle('activa', panel.id === 'panel-' + boton.dataset.panel);
    });
  });
});

// El navegador no deja personalizar el texto, pero sí preguntar: perder media
// hora de edición por cerrar una pestaña sin querer es demasiado fácil.
window.addEventListener('beforeunload', (e) => {
  if (sucio) e.preventDefault();
});

cargar();
