/* ==========================================================================
   guia.js — abre y maneja la guía de cuidado privada.

   El contenido llega cifrado dentro del propio HTML. La clave la trae el QR
   en el fragmento de la URL (#k=CODIGO), que es la parte que el navegador
   NUNCA manda al servidor: no aparece en los registros de Cloudflare, ni en
   la cabecera Referer al pinchar un enlace de las fuentes, ni en analíticas.

   Sin el código esto no muestra nada, y no porque se esté escondiendo con
   CSS: es que el texto no existe en la página hasta que AES lo descifra.
   ========================================================================== */

(function () {
  'use strict';

  var ALMACEN_CODIGO = 'dg-guia-codigo';
  var ALMACEN_TEMA = 'dg-guia-tema';
  var ITERACIONES = 250000; // debe coincidir con generar-guia.py

  var $ = function (id) { return document.getElementById(id); };

  var puerta = $('puerta');
  var cajaPuerta = document.querySelector('.puerta-caja');
  var formCodigo = $('formCodigo');
  var campoCodigo = $('campoCodigo');
  var btnAbrir = $('btnAbrir');
  var puertaError = $('puertaError');
  var app = $('app');
  var cuerpo = $('cuerpo');

  /* --- localStorage puede lanzar excepción (modo privado, cookies
     bloqueadas). Nada de lo que guardamos aquí es imprescindible, así que
     se falla en silencio y la página sigue funcionando igual. --- */
  function leer(clave) {
    try { return localStorage.getItem(clave); } catch (e) { return null; }
  }

  function guardar(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* da igual */ }
  }


  /* ======================================================================
     TEMA
     Se aplica antes de nada para que no haya un destello claro al abrir.
     ====================================================================== */

  var temaGuardado = leer(ALMACEN_TEMA);
  if (temaGuardado) document.documentElement.setAttribute('data-tema', temaGuardado);

  function temaEfectivo() {
    var puesto = document.documentElement.getAttribute('data-tema');
    if (puesto) return puesto;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }

  function alternarTema() {
    var nuevo = temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.setAttribute('data-tema', nuevo);
    guardar(ALMACEN_TEMA, nuevo);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', nuevo === 'oscuro' ? '#101713' : '#19532B');
  }


  /* ======================================================================
     DESCIFRADO
     ====================================================================== */

  function deB64(texto) {
    var crudo = atob(texto);
    var bytes = new Uint8Array(crudo.length);
    for (var i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
    return bytes;
  }

  /* El código se teclea con guiones, sin ellos, en minúsculas o con espacios
     de más si viene pegado de WhatsApp. Todo eso es el mismo código: aquí se
     lleva a la forma canónica antes de derivar la clave. */
  function normalizar(codigo) {
    var limpio = (codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return limpio.replace(/(.{4})(?=.)/g, '$1-');
  }

  function derivarClave(codigo, sal) {
    return crypto.subtle
      .importKey('raw', new TextEncoder().encode(codigo), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: deB64(sal), iterations: ITERACIONES, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
      });
  }

  function descomprimir(buffer) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('navegador-viejo'));
    }
    var flujo = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(flujo).text();
  }

  function abrirCon(codigo) {
    var carga = JSON.parse($('carga').textContent);
    return derivarClave(codigo, carga.sal)
      .then(function (clave) {
        // AES-GCM autentica lo que descifra: si el código está mal, esto
        // falla en vez de devolver basura. Por eso podemos distinguir
        // "código incorrecto" de "archivo corrupto" sin guardar ningún
        // hash del código, que sería una pista para quien no lo tiene.
        return crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: deB64(carga.iv) },
          clave,
          deB64(carga.ct)
        );
      })
      .then(descomprimir);
  }


  /* ======================================================================
     APERTURA
     ====================================================================== */

  function parametrosDelFragmento() {
    var bruto = location.hash.replace(/^#/, '');
    var salida = {};
    if (!bruto) return salida;
    bruto.split('&').forEach(function (par) {
      var trozo = par.split('=');
      if (trozo.length === 2) salida[trozo[0]] = decodeURIComponent(trozo[1]);
    });
    return salida;
  }

  function mostrarError(mensaje) {
    puertaError.textContent = mensaje;
    puertaError.hidden = false;
    cajaPuerta.classList.remove('tiembla');
    void cajaPuerta.offsetWidth; // reinicia la animación
    cajaPuerta.classList.add('tiembla');
  }

  function intentar(codigo, destino) {
    var normalizado = normalizar(codigo);
    if (normalizado.length < 4) {
      mostrarError('Escribe el código que viene con tu árbol.');
      return;
    }

    btnAbrir.disabled = true;
    btnAbrir.textContent = 'Abriendo…';
    puertaError.hidden = true;

    abrirCon(normalizado)
      .then(function (html) {
        guardar(ALMACEN_CODIGO, normalizado);
        montar(html, destino);
      })
      .catch(function (err) {
        btnAbrir.disabled = false;
        btnAbrir.textContent = 'Abrir';
        if (err && err.message === 'navegador-viejo') {
          mostrarError('Tu navegador es demasiado antiguo para abrir la guía. Actualízalo o ábrela en Chrome.');
        } else {
          mostrarError('Ese código no es válido. Revísalo o escríbeme por WhatsApp.');
        }
      });
  }

  function montar(html, destino) {
    cuerpo.innerHTML = html;
    app.hidden = false;
    document.body.classList.remove('cerrada');
    puerta.classList.add('se-va');
    setTimeout(function () { puerta.remove(); }, 500);

    // La clave sale de la barra de direcciones en cuanto abre: así no se
    // filtra en una captura de pantalla ni al compartir el enlace por error.
    // El código ya quedó guardado, de modo que la próxima visita es directa.
    try {
      history.replaceState(null, '', location.pathname + (destino ? '#' + destino : ''));
    } catch (e) { /* da igual */ }

    arrancar();

    if (destino) {
      var objetivo = document.getElementById(destino);
      if (objetivo) setTimeout(function () { objetivo.scrollIntoView(); }, 60);
    }
  }

  function arranqueAutomatico() {
    var params = parametrosDelFragmento();
    var destino = params.s || (location.hash && !params.k ? location.hash.slice(1) : '');
    var codigo = params.k || leer(ALMACEN_CODIGO);

    if (codigo) {
      // Sin parpadeo: se intenta descifrar antes de dibujar la puerta.
      abrirCon(normalizar(codigo))
        .then(function (html) {
          guardar(ALMACEN_CODIGO, normalizar(codigo));
          montar(html, destino);
        })
        .catch(function () {
          // El código guardado ya no vale (lo rotaste). Se olvida y se pide.
          try { localStorage.removeItem(ALMACEN_CODIGO); } catch (e) { }
          if (params.k) mostrarError('Ese código ya no es válido. Escríbeme por WhatsApp y te mando el nuevo.');
        });
    }
  }

  formCodigo.addEventListener('submit', function (e) {
    e.preventDefault();
    intentar(campoCodigo.value, parametrosDelFragmento().s || '');
  });

  // Formatea mientras se escribe: XXXX-XXXX-XXXX-XXXX
  campoCodigo.addEventListener('input', function () {
    var pos = campoCodigo.selectionStart === campoCodigo.value.length;
    campoCodigo.value = normalizar(campoCodigo.value);
    if (pos) campoCodigo.setSelectionRange(campoCodigo.value.length, campoCodigo.value.length);
  });


  /* ======================================================================
     LA GUÍA YA ABIERTA
     ====================================================================== */

  function arrancar() {
    var indice = $('indice');
    var indiceNav = $('indiceNav');
    var velo = $('velo');
    var btnIndice = $('btnIndice');
    var btnCerrarIndice = $('btnCerrarIndice');
    var btnTema = $('btnTema');
    var btnArriba = $('btnArriba');
    var barraTitulo = $('barraTitulo');
    var barraProgreso = $('progreso').firstElementChild;
    var campoBuscar = $('campoBuscar');
    var btnLimpiar = $('btnLimpiar');
    var salidaBusqueda = $('resultadoBusqueda');

    var secciones = [].slice.call(cuerpo.querySelectorAll('.seccion'));
    var portada = cuerpo.querySelector('.portada');

    // El índice viene ya construido desde Python, dentro del bloque cifrado.
    var fuenteIndice = cuerpo.querySelector('.indice-fuente');
    if (fuenteIndice) {
      indiceNav.appendChild(fuenteIndice.firstElementChild);
      fuenteIndice.remove();
    }
    var itemsIndice = [].slice.call(indiceNav.querySelectorAll('.idx-item'));

    /* --- Cajón del índice en móvil --- */
    function abrirIndice(abrir) {
      indice.classList.toggle('abierto', abrir);
      velo.hidden = !abrir;
      btnIndice.setAttribute('aria-expanded', String(abrir));
      document.body.style.overflow = abrir && window.innerWidth <= 1080 ? 'hidden' : '';
    }

    btnIndice.addEventListener('click', function () {
      abrirIndice(!indice.classList.contains('abierto'));
    });
    btnCerrarIndice.addEventListener('click', function () { abrirIndice(false); });
    velo.addEventListener('click', function () { abrirIndice(false); });

    indiceNav.addEventListener('click', function (e) {
      if (e.target.closest('a') && window.innerWidth <= 1080) abrirIndice(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (indice.classList.contains('abierto')) abrirIndice(false);
        else if (document.activeElement === campoBuscar) limpiarBusqueda();
      }
      // Atajo de teclado para buscar, como en cualquier documentación.
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) &&
        document.activeElement !== campoBuscar) {
        e.preventDefault();
        campoBuscar.focus();
      }
    });

    btnTema.addEventListener('click', alternarTema);
    btnArriba.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });


    /* --- Dónde estoy: barra de progreso, título y sección activa --------
       Se hace con un solo manejador de scroll pasivo y sincronizado con el
       repintado. Un IntersectionObserver no sirve bien aquí porque las
       secciones son más altas que la pantalla y varias intersecan a la vez. */
    // Sin valor inicial a propósito: null es un estado válido (estás en la
    // portada, por encima de la primera sección) y hay que poder distinguirlo
    // de "todavía no se ha calculado nada".
    var activa;
    var pendiente = false;

    function repintar(forzar) {
      pendiente = false;
      var alto = document.documentElement.scrollHeight - window.innerHeight;
      var y = window.scrollY;
      barraProgreso.style.width = (alto > 0 ? Math.min(100, (y / alto) * 100) : 0) + '%';
      btnArriba.hidden = y < 600;

      var limite = y + parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--g-barra-alto'), 10) + 40;
      // Solo las secciones a la vista: una sección oculta por la búsqueda
      // mide offsetTop 0, y colada en este bucle rompería el orden creciente
      // del que depende la comparación.
      var actual = null;
      for (var i = 0; i < secciones.length; i++) {
        if (secciones[i].classList.contains('oculto-busqueda')) continue;
        if (secciones[i].offsetTop <= limite) actual = secciones[i];
        else break;
      }
      if (actual === activa && !forzar) return;
      activa = actual;

      itemsIndice.forEach(function (item) {
        var suya = actual && item.dataset.para === actual.id;
        item.classList.toggle('activo', !!suya);
        if (suya) {
          var enlace = item.querySelector('.idx-enlace');
          var caja = indice.getBoundingClientRect();
          var pos = enlace.getBoundingClientRect();
          if (pos.top < caja.top || pos.bottom > caja.bottom) {
            enlace.scrollIntoView({ block: 'nearest' });
          }
        }
      });

      var h2 = actual && actual.querySelector('h2');
      barraTitulo.textContent = h2 ? h2.textContent : 'Guía de cuidado';
    }

    window.addEventListener('scroll', function () {
      if (!pendiente) { pendiente = true; requestAnimationFrame(repintar); }
    }, { passive: true });
    window.addEventListener('resize', repintar, { passive: true });
    repintar();


    /* --- Buscador -----------------------------------------------------
       Guarda el HTML original de cada sección una sola vez y lo restaura
       antes de cada búsqueda. Es más simple y más fiable que ir quitando
       los <mark> a mano, y con 19 secciones el coste es imperceptible. */
    var originales = secciones.map(function (s) { return s.innerHTML; });
    var temporizador = null;

    function escaparRegex(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /* Buscar "riego" tiene que encontrar "riégalo": se comparan las letras
       sin tildes, que es como la gente escribe cuando busca con prisa. */
    function sinTildes(t) {
      return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function resaltar(nodo, termino) {
      var buscador = new RegExp(escaparRegex(termino), 'gi');
      var paseo = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (n.parentNode.closest('script,style,mark')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var textos = [];
      while (paseo.nextNode()) textos.push(paseo.currentNode);

      var total = 0;
      textos.forEach(function (texto) {
        var plano = sinTildes(texto.nodeValue);
        if (!buscador.test(plano)) return;
        buscador.lastIndex = 0;

        var fragmento = document.createDocumentFragment();
        var ultimo = 0;
        var m;
        while ((m = buscador.exec(plano)) !== null) {
          if (m.index > ultimo) {
            fragmento.appendChild(
              document.createTextNode(texto.nodeValue.slice(ultimo, m.index))
            );
          }
          var marca = document.createElement('mark');
          marca.textContent = texto.nodeValue.slice(m.index, m.index + m[0].length);
          fragmento.appendChild(marca);
          ultimo = m.index + m[0].length;
          total++;
          if (m[0].length === 0) buscador.lastIndex++;
        }
        if (ultimo < texto.nodeValue.length) {
          fragmento.appendChild(document.createTextNode(texto.nodeValue.slice(ultimo)));
        }
        texto.parentNode.replaceChild(fragmento, texto);
      });
      return total;
    }

    function limpiarBusqueda() {
      campoBuscar.value = '';
      buscar('');
      campoBuscar.blur();
    }

    function buscar(termino) {
      termino = termino.trim();
      btnLimpiar.hidden = !termino;

      secciones.forEach(function (s, i) { s.innerHTML = originales[i]; });

      if (termino.length < 2) {
        secciones.forEach(function (s) { s.classList.remove('oculto-busqueda'); });
        if (portada) portada.classList.remove('oculto-busqueda');
        salidaBusqueda.hidden = true;
        repintar(true);
        return;
      }

      var plano = sinTildes(termino);
      var conResultado = 0;
      var apariciones = 0;

      secciones.forEach(function (s) {
        var hay = sinTildes(s.textContent).toLowerCase().indexOf(plano.toLowerCase()) !== -1;
        s.classList.toggle('oculto-busqueda', !hay);
        if (!hay) return;
        conResultado++;
        apariciones += resaltar(s, plano);
        // Una respuesta plegada no sirve de nada si es justo la que buscabas.
        [].forEach.call(s.querySelectorAll('details'), function (d) { d.open = true; });
      });

      if (portada) portada.classList.add('oculto-busqueda');

      salidaBusqueda.hidden = false;
      salidaBusqueda.textContent = conResultado === 0
        ? 'Sin resultados para «' + termino + '». Prueba con otra palabra, o escríbeme por WhatsApp.'
        : apariciones + (apariciones === 1 ? ' resultado' : ' resultados') +
        ' en ' + conResultado + (conResultado === 1 ? ' sección' : ' secciones');

      repintar(true);
    }

    campoBuscar.addEventListener('input', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { buscar(campoBuscar.value); }, 160);
    });

    btnLimpiar.addEventListener('click', limpiarBusqueda);
  }

  /* Si la guía ya estaba abierta en una pestaña y llega un enlace con el
     código, el navegador solo cambia el fragmento y no recarga nada. Sin
     esto, pegar la URL del QR en una pestaña ya abierta no haría nada. */
  window.addEventListener('hashchange', function () {
    if (document.getElementById('puerta') && parametrosDelFragmento().k) {
      arranqueAutomatico();
    }
  });

  arranqueAutomatico();
})();
