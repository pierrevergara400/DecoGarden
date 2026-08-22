/*
  Meta Pixel + consentimiento de cookies — DecoGarden
  ------------------------------------------------------------------
  1. Entra a business.facebook.com → Administrador de eventos → Orígenes de datos.
  2. Crea el píxel (o abre el que ya tienes) y copia su ID numérico.
  3. Pégalo abajo. Mientras diga TU_PIXEL_ID no se carga ni se envía nada,
     así el sitio no habla con Meta en desarrollo.

  El píxel NO se descarga hasta que la persona acepta. Rechazar no es
  "cargarlo y callarlo": es no pedir el archivo a Meta. Eso es lo que exige
  la Ley Orgánica de Protección de Datos Personales y es lo que hace esto.

  Los eventos que dispara el sitio:
    PageView          — todas las páginas, automático
    ViewContent       — páginas de producto (precio y nombre incluidos)
    InitiateCheckout  — al abrir el formulario de compra
    AddToCart         — al pasar al paso 2 del formulario
    AddPaymentInfo    — al elegir método de pago
    Lead              — al enviar el pedido a WhatsApp  ← la conversión a optimizar
    Contact           — clic en cualquier enlace suelto de WhatsApp
*/
(function () {
  const PIXEL_ID = 'TU_PIXEL_ID';
  const MONEDA = 'USD';
  const COOKIE = 'dg_consent';
  const DURACION = 60 * 60 * 24 * 180; // 6 meses, igual que dice la política

  const configurado = /^\d{6,}$/.test(PIXEL_ID);
  const prod = window.DG_PRODUCTO;
  let cargado = false;

  // --- Consentimiento guardado ---------------------------------------------

  function consentimiento() {
    const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function guardar(valor) {
    document.cookie = COOKIE + '=' + valor + ';path=/;max-age=' + DURACION + ';SameSite=Lax';
  }

  // --- El píxel -------------------------------------------------------------

  // Existe siempre para que el resto del sitio pueda llamarlo sin comprobar nada.
  // Si no hay consentimiento o no hay ID, no hace nada.
  window.dgTrack = function (evento, datos) {
    if (!cargado) return;
    fbq('track', evento, Object.assign({ currency: MONEDA }, datos || {}));
  };

  function cargarPixel() {
    if (cargado || !configurado) return;
    cargado = true;

    // Código base de Meta (no tocar)
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/es_LA/fbevents.js');

    fbq('init', PIXEL_ID);
    fbq('track', 'PageView');

    // Las páginas de producto declaran window.DG_PRODUCTO antes de este script
    if (prod && prod.id) {
      window.dgTrack('ViewContent', {
        content_ids: [prod.id],
        content_name: prod.nombre,
        content_type: 'product',
        value: prod.precio
      });
    }
  }

  // --- Eventos del sitio ----------------------------------------------------

  // Se cablea siempre, con o sin consentimiento: así se puede probar el embudo
  // sin píxel activo, y el día que alguien acepta ya está todo enganchado.
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href*="wa.me"]');
    if (!link) return;
    window.dgTrack('Contact', {
      content_name: (prod && prod.nombre) || document.title
    });
  }, true);

  // --- Aviso de cookies -----------------------------------------------------

  function construirAviso() {
    const aviso = document.createElement('div');
    aviso.className = 'dg-cookies';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Aviso de cookies');
    aviso.innerHTML =
      '<p>Uso cookies de medición para saber qué contenido te sirve y llegar a más gente ' +
      'como tú. Solo se activan si las aceptas. Puedes leer el detalle en la ' +
      '<a href="privacidad.html">política de privacidad</a>.</p>' +
      '<div class="dg-cookies-acciones">' +
      '<button type="button" class="dg-cookies-no">Rechazar</button>' +
      '<button type="button" class="dg-cookies-si">Aceptar</button>' +
      '</div>';

    const cerrar = () => aviso.remove();

    aviso.querySelector('.dg-cookies-si').addEventListener('click', () => {
      guardar('granted');
      cargarPixel();
      cerrar();
    });

    aviso.querySelector('.dg-cookies-no').addEventListener('click', () => {
      guardar('denied');
      cerrar();
    });

    document.body.appendChild(aviso);
  }

  function alEstarListo(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // "Preferencias de cookies" en el pie de página: vuelve a preguntar
  document.addEventListener('click', function (e) {
    const enlace = e.target.closest('[data-abrir-cookies]');
    if (!enlace) return;
    e.preventDefault();
    if (document.querySelector('.dg-cookies')) return;
    construirAviso();
  });

  const decidido = consentimiento();
  if (decidido === 'granted') {
    cargarPixel();
  } else if (decidido !== 'denied') {
    alEstarListo(construirAviso);
  }
})();
