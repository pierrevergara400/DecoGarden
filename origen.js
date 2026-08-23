/*
  Atribución de origen — DecoGarden
  ------------------------------------------------------------------
  La venta se cierra en WhatsApp, así que el píxel puede contar cuánta gente
  llega al chat pero no cuál de esas conversaciones acabó en venta. Y en la
  bandeja de entrada un mensaje que viene de un anuncio es idéntico a uno que
  viene de Instagram o de un amigo.

  Esto lo resuelve por el lado más simple: si alguien llega desde una campaña,
  se recuerda durante su visita y se añade una marca corta al final del mensaje
  que WhatsApp ya trae escrito. En el chat se ve así:

      Hola DecoGarden, quiero comprar el Bequia Mini ($40).
      ...
      · web/arbol-vida-ago

  Con eso cada venta cerrada queda atribuida sola, sin preguntarle a nadie
  "¿de dónde me encontraste?".

  De dónde sale la marca, por orden de preferencia:
      ?utm_campaign=...  ->  el nombre de la campaña
      ?utm_source=...    ->  el origen, si no hay campaña
      ?fbclid=...        ->  "meta", cuando el anuncio no trae utm

  No se guarda nada de la persona: solo de qué campaña vino, en sessionStorage,
  y se borra al cerrar la pestaña.
*/
(function () {
  const CLAVE = 'dg_origen';
  const TELEFONO_TEXTO = 'text';

  /* El valor viene de la URL, o sea que cualquiera puede inventarse uno.
     Se recorta a caracteres inocuos para que nadie pueda usar un enlace
     preparado para meter texto raro en el mensaje que la persona va a enviar. */
  function limpiar(valor) {
    return String(valor || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
  }

  function detectar() {
    const p = new URLSearchParams(location.search);
    const campana = limpiar(p.get('utm_campaign'));
    if (campana) return campana;
    const fuente = limpiar(p.get('utm_source'));
    if (fuente) return fuente;
    if (p.get('fbclid')) return 'meta';
    return '';
  }

  // Lo detectado manda; si no hay nada en la URL, se conserva lo de antes:
  // la persona pudo entrar por el anuncio y navegar a otra página del sitio.
  let origen = '';
  try {
    const nuevo = detectar();
    if (nuevo) sessionStorage.setItem(CLAVE, nuevo);
    origen = nuevo || sessionStorage.getItem(CLAVE) || '';
  } catch (e) {
    origen = detectar(); // navegador sin sessionStorage: dura solo esta página
  }

  const MARCA = origen ? `\n· web/${origen}` : '';

  // Lo usa el formulario de compra, que arma su mensaje por su cuenta
  window.dgOrigen = function () {
    return MARCA;
  };

  if (!MARCA) return;

  /* Los enlaces se reescriben al hacer clic, no al cargar: las tarjetas del
     catálogo las pinta app.js después de leer catalog.json, así que en carga
     todavía no existen. */
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href*="wa.me"]');
    if (!link) return;

    const url = new URL(link.href);
    const texto = url.searchParams.get(TELEFONO_TEXTO) || '';
    if (texto.includes(MARCA.trim())) return; // ya marcado, no duplicar

    url.searchParams.set(TELEFONO_TEXTO, texto ? texto + MARCA : MARCA.trim());
    link.href = url.toString();
  }, true);
})();
