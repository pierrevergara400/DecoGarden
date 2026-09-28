// IntersectionObserver para animaciones de entrada (.rv)
const io = new IntersectionObserver((es) => {
  es.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: .14 });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

// Header flotante: se esconde al bajar, aparece al subir
const topbar = document.querySelector('.topbar');
if (topbar) {
  let lastScrollY = 0;
  let ticking = false;
  const SCROLL_THRESHOLD = 8;
  const REVEAL_ZONE = 80; // siempre visible cerca del tope

  const updateHeader = () => {
    const currentScrollY = window.scrollY;
    const delta = currentScrollY - lastScrollY;
    const menuOpen = mainNav && mainNav.classList.contains('open');

    if (!menuOpen) {
      if (currentScrollY <= REVEAL_ZONE) {
        topbar.classList.remove('header-hidden');
      } else if (delta > SCROLL_THRESHOLD) {
        topbar.classList.add('header-hidden');
      } else if (delta < -SCROLL_THRESHOLD) {
        topbar.classList.remove('header-hidden');
      }
    }

    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }, { passive: true });
}

// Menú móvil (hamburguesa)
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
if (navToggle && mainNav) {
  const closeMenu = () => {
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  };
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!mainNav.classList.contains('open')) return;
    if (!mainNav.contains(e.target) && !navToggle.contains(e.target)) closeMenu();
  });
}

// Configuración del catálogo dinámico
const LIMIT = 6;
let expanded = false;
let current = 'todos';
let catalogData = [];
// id -> archivo de su página de producto. Lo genera scripts/generar_productos.py.
let paginasProducto = {};

const grid = document.querySelector('.catalog-grid');
const tabs = document.querySelectorAll('.filter-tab');
const moreWrap = document.querySelector('.more-wrap');
const moreBtn = document.getElementById('verMas');

// Reglas de envío vigentes. Un solo lugar: la tarjeta, el schema y los textos
// del sitio salen todos de aquí para que no se contradigan entre sí.
const ENVIO = { costo: 6, gratisDesde: 60 };

function precioNumerico(precio) {
  const n = parseFloat(String(precio || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Un pedido de una sola pieza paga envío hasta llegar al umbral
function envioGratis(precio) {
  return precioNumerico(precio) >= ENVIO.gratisDesde;
}

function etiquetaEnvio(precio) {
  return envioGratis(precio) ? 'Envío gratis' : `+ $${ENVIO.costo} de envío`;
}

// Campos sin los que una tarjeta no se puede mostrar de forma confiable
const REQUIRED_FIELDS = ['nombre', 'imagen', 'categoria', 'precio', 'whatsappMsg'];

/* Un bonsai se publica salvo que se diga lo contrario.

   "activo": false lo saca del catalogo sin borrar sus datos: no aparece en la
   home, no entra en el schema y el generador lo deja fuera del sitemap y de los
   relacionados. Sirve para preparar un arbol con calma —las fotos, la ficha— y
   encenderlo cuando este listo. Que la ausencia del campo signifique publicado
   evita tener que marcar uno por uno los que ya estaban en linea. */
function estaPublicado(item) {
  return !item || item.activo !== false;
}

function isValidCatalogItem(item) {
  if (!item || typeof item !== 'object') return false;
  const hasRequiredFields = REQUIRED_FIELDS.every(field => typeof item[field] === 'string' && item[field].trim() !== '');
  if (!hasRequiredFields) return false;
  if (item.categoria !== 'entrada' && item.categoria !== 'coleccion') return false;
  return true;
}

// Completa campos opcionales ausentes para que nunca se imprima "undefined" en una tarjeta
function normalizeCatalogItem(item) {
  return {
    especie: '', altura: '', edad: '', descripcion: '', detallePrecio: '',
    badgeClass: 'ok', badgeTexto: 'Disponible',
    ...item
  };
}

// Renderizar las tarjetas de bonsáis
function renderCatalog() {
  if (!grid) return;
  
  // Filtrar según la categoría activa
  const matches = catalogData.filter(item => current === 'todos' || item.categoria === current);
  
  // Cortar por el límite si no está expandido
  const visibleItems = expanded ? matches : matches.slice(0, LIMIT);
  
  // Generar HTML
  grid.innerHTML = visibleItems.map(item => {
    const pagina = paginasProducto[item.id];

    // Con página propia: la foto, el título y el botón llevan al detalle.
    // Sin página: se mantiene el flujo directo a WhatsApp.
    const foto = pagina
      ? `<a class="shot" href="${pagina}" aria-label="Ver ${item.nombre}">
        <img src="${item.imagen}" alt="${item.nombre}" onerror="this.remove()" loading="lazy" decoding="async">
        <span class="badge ${item.badgeClass}">${item.badgeTexto}</span>
      </a>`
      : `<div class="shot">
        <img src="${item.imagen}" alt="${item.nombre}" onerror="this.remove()" loading="lazy" decoding="async">
        <span class="badge ${item.badgeClass}">${item.badgeTexto}</span>
      </div>`;

    const titulo = pagina
      ? `<h3><a href="${pagina}">${item.nombre}</a></h3>`
      : `<h3>${item.nombre}</h3>`;

    const cta = pagina
      ? `<a class="btn btn-primary" href="${pagina}">
            Ver bonsái
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>`
      : `<a class="btn btn-primary"
            href="https://wa.me/593963136655?text=${encodeURIComponent(item.whatsappMsg)}"
            target="_blank"
            rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m0 18.15c-1.53 0-3.03-.41-4.34-1.19l-.31-.18-3.12.82.83-3.04-.2-.32a8.19 8.19 0 0 1-1.26-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23m4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14 0-.31-.01-.48-.01a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28" />
            </svg>
            Lo quiero
          </a>`;

    return `
    <article class="bonsai-card" data-cat="${item.categoria}">
      ${foto}
      <div class="info">
        <div class="card-tags">
          <span class="chip">${item.categoria === 'entrada' ? 'Para empezar' : 'De colección'}</span>
          <span class="ship-tag ${envioGratis(item.precio) ? 'free' : 'paid'}">${etiquetaEnvio(item.precio)}</span>
        </div>
        ${titulo}
        <div class="meta">${item.especie} · ${item.altura} · ${item.edad}</div>
        <p class="desc">${item.descripcion}</p>
        <div class="price">${item.precio} <small>· ${item.detallePrecio}</small></div>
        <div class="buy">
          ${cta}
        </div>
      </div>
    </article>
  `;
  }).join('');

  // Controlar visibilidad del botón "Ver más"
  if (matches.length > LIMIT) {
    moreWrap.style.display = 'flex';
    moreBtn.textContent = expanded ? 'Ver menos' : `Ver más bonsáis (${matches.length - LIMIT})`;
  } else {
    moreWrap.style.display = 'none';
  }

  // Manejar el fade-in premium de las imágenes cuando cargan
  grid.querySelectorAll('.shot img').forEach(img => {
    if (img.complete) {
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', () => img.classList.add('loaded'));
    }
  });
}

// Inyectar datos estructurados (SEO) de los bonsáis disponibles
function injectCatalogSchema(items) {
  const sold = /vendid|agotad|reservad/i;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => {
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: item.nombre,
          image: `https://decogarden.pages.dev/${item.imagen}`,
          description: item.descripcion,
          category: item.categoria === 'entrada' ? 'Para empezar' : 'De colección',
          brand: {
            '@type': 'Brand',
            name: 'DecoGarden'
          },
          offers: {
            '@type': 'Offer',
            priceCurrency: 'USD',
            price: (item.precio || '').replace(/[^0-9.]/g, ''),
            availability: sold.test(item.badgeTexto || '')
              ? 'https://schema.org/OutOfStock'
              : 'https://schema.org/InStock',
            url: 'https://decogarden.pages.dev/#catalogo',
            shippingDetails: {
              '@type': 'OfferShippingDetails',
              shippingRate: {
                '@type': 'MonetaryAmount',
                value: envioGratis(item.precio) ? '0' : String(ENVIO.costo),
                currency: 'USD'
              },
              shippingDestination: {
                '@type': 'DefinedRegion',
                addressCountry: 'EC'
              }
            }
          }
        }
      };
    })
  };

  let tag = document.getElementById('catalog-schema');
  if (!tag) {
    tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.id = 'catalog-schema';
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(schema);
}

// Cargar catálogo desde JSON
async function loadCatalog() {
  try {
    // paginas.json es opcional: si falta, las tarjetas siguen yendo a WhatsApp.
    const [res, resPaginas] = await Promise.all([
      fetch('data/catalog.json'),
      fetch('data/paginas.json').catch(() => null)
    ]);
    if (resPaginas && resPaginas.ok) {
      paginasProducto = await resPaginas.json().catch(() => ({}));
    }
    if (!res.ok) throw new Error('Error al cargar catálogo');
    const data = await res.json();
    const publicados = Array.isArray(data) ? data.filter(estaPublicado) : [];
    catalogData = publicados.filter(isValidCatalogItem).map(normalizeCatalogItem);
    if (publicados.length !== catalogData.length) {
      console.warn(`Catálogo: se omitieron ${publicados.length - catalogData.length} bonsái(s) con datos incompletos.`);
    }
    renderCatalog();
    injectCatalogSchema(catalogData);
  } catch (err) {
    console.error('Error cargando los bonsáis:', err);
    // Fallback: mostrar mensaje en el catálogo
    if (grid) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 40px 0;">No se pudo cargar el catálogo de bonsáis en este momento. Por favor, escríbeme directamente por WhatsApp.</p>';
    }
  }
}

// Inicializar pestañas de filtrado
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-pressed', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-pressed', 'true');
    current = tab.dataset.filter;
    expanded = false;
    renderCatalog();
  });
});

// Inicializar botón "Ver más"
if (moreBtn) {
  moreBtn.addEventListener('click', () => {
    expanded = !expanded;
    renderCatalog();
  });
}

// Cargar catálogo inicial
loadCatalog();

// --- Lógica del Lightbox (Event Delegation para compatibilidad dinámica) ---
// Los estilos viven en style.css (.dg-lightbox), no se inyectan desde aquí.
const lightbox = document.createElement('div');
lightbox.className = 'dg-lightbox';
lightbox.innerHTML = '<div class="dg-inner"><img alt=""></div>';
document.body.appendChild(lightbox);
const lightboxImg = lightbox.querySelector('img');
const lightboxInner = lightbox.querySelector('.dg-inner');

// Delegación de eventos para imágenes estáticas y dinámicas
document.body.addEventListener('click', (event) => {
  const zoomBtn = event.target.closest('.gallery-zoom');
  const target = zoomBtn
    ? zoomBtn.parentElement.querySelector('.gallery-media.is-active:not(video)')
      || zoomBtn.parentElement.querySelector('.gallery-shot')
    : event.target.matches('.shot img, .resena-fotos img, .gallery-shot') ? event.target : null;
  // Si la foto está dentro de un enlace (tarjeta que lleva a su página), dejamos navegar.
  if (target && !(!zoomBtn && target.closest('a'))) {
    abrirLightbox(target);
  }
});

function abrirLightbox(foto) {
  lightbox.classList.remove('closing');
  lightboxImg.src = foto.src;
  lightboxImg.alt = foto.alt || '';
  lightbox.classList.add('open');
  // Sin esto la página seguía desplazándose por detrás de la foto ampliada
  document.body.style.overflow = 'hidden';
}

let finLightbox;
function cerrarLightbox() {
  if (!lightbox.classList.contains('open') || lightbox.classList.contains('closing')) return;
  lightbox.classList.add('closing');
  document.body.style.overflow = '';

  const terminar = () => {
    clearTimeout(finLightbox);
    // Quitarlo a mano y no fiarlo a { once: true }: si cierra el temporizador,
    // el listener seguiría vivo y mataría la apertura siguiente en cuanto
    // terminara su animación de entrada.
    lightbox.removeEventListener('animationend', terminar);
    lightbox.classList.remove('open', 'closing');
    lightboxImg.removeAttribute('src');
  };
  // El temporizador es el respaldo: si la animación no llega a correr, la foto
  // no se queda congelada en pantalla.
  finLightbox = setTimeout(terminar, 300);
  lightbox.addEventListener('animationend', terminar);
}

// Cualquier punto del lightbox cierra, la foto incluida: lleva cursor
// zoom-out desde siempre y hasta ahora no hacía nada al pulsarla.
lightbox.addEventListener('click', cerrarLightbox);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cerrarLightbox();
});
// --- Carrusel en las fotos de las reseñas ---
// Una reseña con más de una <img> en su .resena-fotos se vuelve carrusel: basta
// con meter todas sus fotos en ese mismo bloque de index.html. Con una sola foto
// queda tal cual.
// Se desliza con el dedo (scroll-snap nativo) y con flechas y puntos.
const flechaCarrusel = d =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const sinAnimacion = window.matchMedia('(prefers-reduced-motion: reduce)');

function montarCarrusel(bloque) {
  bloque.querySelectorAll('.carrusel-nav, .carrusel-puntos').forEach(el => el.remove());
  const fotos = [...bloque.querySelectorAll('img')];
  let pista = bloque.querySelector('.carrusel-pista');

  // Si no cargó ninguna foto, la tarjeta se queda solo con el texto
  bloque.hidden = fotos.length === 0;

  if (fotos.length < 2) {
    // Si alguna foto no cargó (onerror la quita) y queda una, se desarma
    if (pista) pista.replaceWith(...pista.childNodes);
    bloque.classList.remove('carrusel');
    bloque.removeAttribute('role');
    bloque.removeAttribute('aria-roledescription');
    return;
  }

  if (!pista) {
    pista = document.createElement('div');
    pista.className = 'carrusel-pista';
    bloque.prepend(pista);
  }
  // onscroll y no addEventListener: una reseña copiada por el carrusel de
  // reseñas trae la pista hecha pero sin oyentes, y así se engancha igual.
  pista.onscroll = () => marcarPunto(bloque);
  pista.append(...fotos);
  bloque.classList.add('carrusel');
  bloque.setAttribute('role', 'region');
  bloque.setAttribute('aria-roledescription', 'carrusel');

  const irA = i => {
    const total = pista.children.length;
    const destino = (i + total) % total;
    pista.scrollTo({ left: destino * pista.clientWidth, behavior: sinAnimacion.matches ? 'auto' : 'smooth' });
  };
  const actual = () => Math.round(pista.scrollLeft / pista.clientWidth);

  const anterior = document.createElement('button');
  anterior.type = 'button';
  anterior.className = 'carrusel-nav prev';
  anterior.setAttribute('aria-label', 'Foto anterior');
  anterior.innerHTML = flechaCarrusel('m15 18-6-6 6-6');
  anterior.addEventListener('click', () => irA(actual() - 1));

  const siguiente = document.createElement('button');
  siguiente.type = 'button';
  siguiente.className = 'carrusel-nav next';
  siguiente.setAttribute('aria-label', 'Foto siguiente');
  siguiente.innerHTML = flechaCarrusel('m9 18 6-6-6-6');
  siguiente.addEventListener('click', () => irA(actual() + 1));

  const puntos = document.createElement('div');
  puntos.className = 'carrusel-puntos';
  fotos.forEach((_, i) => {
    const punto = document.createElement('button');
    punto.type = 'button';
    punto.setAttribute('aria-label', `Foto ${i + 1} de ${fotos.length}`);
    punto.addEventListener('click', () => irA(i));
    puntos.appendChild(punto);
  });

  bloque.append(anterior, siguiente, puntos);
  marcarPunto(bloque);
}

function marcarPunto(bloque) {
  const pista = bloque.querySelector('.carrusel-pista');
  if (!pista || !pista.clientWidth) return;
  const i = Math.round(pista.scrollLeft / pista.clientWidth);
  bloque.querySelectorAll('.carrusel-puntos button').forEach((punto, n) => {
    punto.classList.toggle('activo', n === i);
    punto.setAttribute('aria-current', n === i ? 'true' : 'false');
  });
}

// --- Carrusel de reseñas ---
// Escritorio muestra 3, con la del centro destacada y las de los lados en
// penumbra; tableta muestra 2. La fila avanza una tarjeta cada 5 segundos, sin
// fin: al final de la pista van copias de las
// primeras, y al llegar a ellas se salta sin animación al principio real, que
// se ve idéntico. En móvil no hay carrusel: las 3 primeras y "Ver más".
//
// Cuesta un temporizador y una transformación CSS. Se para con el ratón o el
// foco encima (para poder leer), fuera de pantalla y con la pestaña oculta. Con
// "reducir movimiento" activado no avanza solo: quedan las flechas.
const resenas = document.querySelector('.resenas');
const MOVIL = window.matchMedia('(max-width: 560px)');
const TABLETA = window.matchMedia('(max-width: 900px)');
// Cada cuánto avanza. El deslizamiento en sí dura lo que diga la transición de
// .resenas-pista en style.css.
const PASO_MS = 5000;
const EN_MOVIL = 3;

if (resenas) {
  const originales = [...resenas.querySelectorAll(':scope > .resena')];
  let pista = null, controles = null, masWrap = null;
  let indice = 0, temporizador = null, conCentro = false;
  let enPantalla = false, encima = false;

  const puedeAvanzar = () =>
    pista && enPantalla && !encima && !document.hidden && !sinAnimacion.matches;

  const reprogramar = () => {
    clearInterval(temporizador);
    temporizador = puedeAvanzar() ? setInterval(() => mover(1), PASO_MS) : null;
  };

  const paso = () => {
    const [a, b] = pista.children;
    return b.offsetLeft - a.offsetLeft;
  };

  const colocar = (animar) => {
    pista.classList.toggle('sin-transicion', !animar);
    pista.style.transform = `translateX(${-indice * paso()}px)`;
    // Con tres a la vista, la del medio es la que se lee: sobresale y las de
    // los lados quedan atenuadas (lo pinta style.css con .es-centro).
    if (conCentro) {
      [...pista.children].forEach((r, i) => r.classList.toggle('es-centro', i === indice + 1));
    }
    if (!animar) void pista.offsetWidth; // aplica ya el salto antes de reanimar
  };

  function mover(direccion) {
    // Si el navegador no llegó a avisar del final de la animación (pestaña
    // oculta a medio camino), el índice pudo quedarse en las copias: a su sitio.
    if (indice >= originales.length) {
      indice -= originales.length;
      colocar(false);
    }
    if (direccion < 0 && indice === 0) {
      // Hacia atrás desde el principio: salto invisible a las copias del final
      indice = originales.length;
      colocar(false);
    }
    indice += direccion;
    colocar(true);
  }

  const alTerminar = (event) => {
    if (event.target !== pista || event.propertyName !== 'transform') return;
    if (indice >= originales.length) {
      indice -= originales.length;
      colocar(false);
    }
  };

  function desmontar() {
    clearInterval(temporizador);
    if (pista) {
      pista.removeEventListener('transitionend', alTerminar);
      resenas.append(...originales);
      pista.remove();
      pista = null;
    }
    controles?.remove();
    masWrap?.remove();
    controles = masWrap = null;
    resenas.classList.remove('es-carrusel');
    resenas.removeAttribute('role');
    resenas.removeAttribute('aria-roledescription');
    originales.forEach(r => r.classList.remove('resena-oculta'));
  }

  function montarCarruselResenas(visibles) {
    conCentro = visibles === 3;
    pista = document.createElement('div');
    pista.className = 'resenas-pista' + (conCentro ? ' con-centro' : '');
    pista.append(...originales);
    // Copias de las primeras para que el final empalme con el principio. No
    // son contenido nuevo: fuera del lector de pantalla y del tabulador.
    originales.slice(0, visibles).forEach(r => {
      const copia = r.cloneNode(true);
      copia.setAttribute('aria-hidden', 'true');
      copia.inert = true;
      // Son las mismas fotos que ya bajaron las originales: sin lazy, para que
      // la copia no aparezca con el recuadro vacío mientras entra en escena.
      copia.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
      pista.appendChild(copia);
    });
    resenas.appendChild(pista);
    resenas.classList.add('es-carrusel');
    resenas.setAttribute('role', 'region');
    resenas.setAttribute('aria-roledescription', 'carrusel');
    pista.addEventListener('transitionend', alTerminar);

    controles = document.createElement('div');
    controles.className = 'resenas-controles';
    const boton = (etiqueta, d, direccion) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', etiqueta);
      b.innerHTML = flechaCarrusel(d);
      b.addEventListener('click', () => { mover(direccion); reprogramar(); });
      return b;
    };
    controles.append(
      boton('Reseña anterior', 'm15 18-6-6 6-6', -1),
      boton('Reseña siguiente', 'm9 18 6-6-6-6', 1),
    );
    resenas.after(controles);

    indice = 0;
    colocar(false);
    reprogramar();
  }

  function montarVerMas() {
    const extra = originales.slice(EN_MOVIL);
    extra.forEach(r => r.classList.add('resena-oculta'));
    masWrap = document.createElement('div');
    masWrap.className = 'more-wrap';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-more claro';
    boton.textContent = `Ver más reseñas (${extra.length})`;
    boton.setAttribute('aria-expanded', 'false');
    boton.addEventListener('click', () => {
      const abrir = boton.getAttribute('aria-expanded') === 'false';
      extra.forEach(r => r.classList.toggle('resena-oculta', !abrir));
      boton.setAttribute('aria-expanded', String(abrir));
      boton.textContent = abrir ? 'Ver menos reseñas' : `Ver más reseñas (${extra.length})`;
      // Al cerrar, la página encoge de golpe: volvemos al inicio de la sección
      if (!abrir) resenas.scrollIntoView({ block: 'start', behavior: sinAnimacion.matches ? 'auto' : 'smooth' });
    });
    masWrap.appendChild(boton);
    resenas.after(masWrap);
  }

  function organizar() {
    desmontar();
    const visibles = TABLETA.matches ? 2 : 3;
    if (MOVIL.matches) {
      if (originales.length > EN_MOVIL) montarVerMas();
    } else if (originales.length > visibles || (visibles === 3 && originales.length === 3)) {
      // Con justo tres en escritorio también gira: si no, no habría una "del
      // centro" que destacar y la sección quedaría quieta.
      montarCarruselResenas(visibles);
    }
    // Las fotos de cada reseña (y de sus copias) se montan después: una copia
    // trae el HTML del carrusel de fotos pero no sus oyentes.
    resenas.querySelectorAll('.resena-fotos').forEach(montarCarrusel);
  }

  organizar();
  MOVIL.addEventListener('change', organizar);
  TABLETA.addEventListener('change', organizar);
  sinAnimacion.addEventListener('change', reprogramar);

  // Al cambiar el ancho de la ventana cambia lo que mide cada paso
  window.addEventListener('resize', () => { if (pista) colocar(false); }, { passive: true });

  new IntersectionObserver(([entrada]) => {
    enPantalla = entrada.isIntersecting;
    reprogramar();
  }).observe(resenas);

  document.addEventListener('visibilitychange', reprogramar);
  resenas.addEventListener('mouseenter', () => { encima = true; reprogramar(); });
  resenas.addEventListener('mouseleave', () => { encima = false; reprogramar(); });
  resenas.addEventListener('focusin', () => { encima = true; reprogramar(); });
  resenas.addEventListener('focusout', () => { encima = false; reprogramar(); });

  // Deslizar con el dedo en tableta. Si el gesto empieza sobre las fotos de
  // una reseña, es para ese carrusel de fotos, no para el de reseñas.
  let inicioX = null;
  resenas.addEventListener('pointerdown', (e) => {
    inicioX = pista && e.pointerType !== 'mouse' && !e.target.closest('.carrusel-pista') ? e.clientX : null;
  });
  resenas.addEventListener('pointerup', (e) => {
    if (inicioX === null) return;
    const dx = e.clientX - inicioX;
    inicioX = null;
    if (Math.abs(dx) > 40) { mover(dx < 0 ? 1 : -1); reprogramar(); }
  });
}

// Una foto que no carga se borra sola (onerror="this.remove()"); el carrusel
// se rehace después para que no queden puntos de fotos que ya no existen.
document.addEventListener('error', (event) => {
  const bloque = event.target instanceof HTMLImageElement && event.target.closest('.resena-fotos');
  if (bloque) setTimeout(() => montarCarrusel(bloque));
}, true);
