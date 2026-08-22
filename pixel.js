/*
  Meta Pixel — DecoGarden
  ------------------------------------------------------------------
  1. Entra a business.facebook.com → Administrador de eventos → Orígenes de datos.
  2. Crea el píxel (o abre el que ya tienes) y copia su ID numérico.
  3. Pégalo abajo. Mientras diga TU_PIXEL_ID no se carga ni se envía nada,
     así el sitio no habla con Meta en desarrollo.

  Los eventos que dispara esta página:
    PageView          — todas las páginas, automático
    ViewContent       — páginas de producto (precio y nombre incluidos)
    InitiateCheckout  — al abrir el formulario de compra
    AddPaymentInfo    — al elegir método de pago
    Lead              — al enviar el pedido a WhatsApp  ← la conversión a optimizar
    Contact           — clic en cualquier enlace suelto de WhatsApp
*/
(function () {
  const PIXEL_ID = 'TU_PIXEL_ID';
  const MONEDA = 'USD';

  const activo = /^\d{6,}$/.test(PIXEL_ID);

  // Sin ID el sitio funciona igual: dgTrack existe pero no envía nada
  window.dgTrack = function (evento, datos) {
    if (!activo) return;
    fbq('track', evento, Object.assign({ currency: MONEDA }, datos || {}));
  };

  // El cableado de eventos se arma siempre, así se puede probar sin píxel activo
  const prod = window.DG_PRODUCTO;

  // Cualquier enlace a WhatsApp cuenta como contacto, incluido el botón flotante
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href*="wa.me"]');
    if (!link) return;
    window.dgTrack('Contact', {
      content_name: (prod && prod.nombre) || document.title
    });
  }, true);

  if (!activo) return;

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
})();

