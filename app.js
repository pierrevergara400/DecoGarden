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
  let lastScrollY = window.scrollY;
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

const grid = document.querySelector('.catalog-grid');
const tabs = document.querySelectorAll('.filter-tab');
const moreWrap = document.querySelector('.more-wrap');
const moreBtn = document.getElementById('verMas');

// Campos sin los que una tarjeta no se puede mostrar de forma confiable
const REQUIRED_FIELDS = ['nombre', 'imagen', 'categoria', 'precio', 'whatsappMsg'];

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
  grid.innerHTML = visibleItems.map(item => `
    <article class="bonsai-card" data-cat="${item.categoria}">
      <div class="shot">
        <img src="${item.imagen}" alt="${item.nombre}" onerror="this.remove()" loading="lazy" decoding="async">
        <span class="badge ${item.badgeClass}">${item.badgeTexto}</span>
      </div>
      <div class="info">
        <span class="chip">${item.categoria === 'entrada' ? 'Para empezar' : 'De colección'}</span>
        <h3>${item.nombre}</h3>
        <div class="meta">${item.especie} · ${item.altura} · ${item.edad}</div>
        <p class="desc">${item.descripcion}</p>
        <div class="price">${item.precio} <small>· ${item.detallePrecio}</small></div>
        <p class="ship-note">Precio no incluye envío</p>
        <div class="buy">
          <a class="btn btn-primary"
            href="https://wa.me/593963136655?text=${encodeURIComponent(item.whatsappMsg)}" 
            target="_blank" 
            rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m0 18.15c-1.53 0-3.03-.41-4.34-1.19l-.31-.18-3.12.82.83-3.04-.2-.32a8.19 8.19 0 0 1-1.26-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23m4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14 0-.31-.01-.48-.01a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28" />
            </svg>
            Lo quiero
          </a>
        </div>
      </div>
    </article>
  `).join('');

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
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: item.nombre,
        image: `https://decogarden.pages.dev/${item.imagen}`,
        description: item.descripcion,
        category: item.categoria === 'entrada' ? 'Para empezar' : 'De colección',
        offers: {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: (item.precio || '').replace(/[^0-9.]/g, ''),
          availability: sold.test(item.badgeTexto || '')
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
          url: 'https://decogarden.pages.dev/#catalogo'
        }
      }
    }))
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
    const res = await fetch('catalog.json');
    if (!res.ok) throw new Error('Error al cargar catálogo');
    const data = await res.json();
    catalogData = Array.isArray(data) ? data.filter(isValidCatalogItem).map(normalizeCatalogItem) : [];
    if (Array.isArray(data) && catalogData.length !== data.length) {
      console.warn(`Catálogo: se omitieron ${data.length - catalogData.length} bonsái(s) con datos incompletos.`);
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
const lightboxStyle = document.createElement('style');
lightboxStyle.textContent = `
  .dg-lightbox {
    position: fixed;
    inset: 0;
    display: none;
    justify-content: center;
    align-items: center;
    background: rgba(0,0,0,.75);
    z-index: 1100;
    padding: 32px;
  }
  .dg-lightbox.open { display: flex; }
  .dg-lightbox .dg-inner {
    position: relative;
    max-width: min(1200px, calc(100vw - 64px));
    max-height: calc(100vh - 64px);
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
    width: auto;
    height: auto;
    padding: 12px;
    box-sizing: border-box;
  }
  .dg-lightbox img {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    display: block;
    border-radius: 12px;
    box-shadow: 0 24px 80px rgba(0,0,0,.45);
    cursor: zoom-out;
  }
  .shot img, .proof-photos img { cursor: zoom-in; }
`;
document.head.appendChild(lightboxStyle);

const lightbox = document.createElement('div');
lightbox.className = 'dg-lightbox';
lightbox.innerHTML = '<div class="dg-inner"><img alt=""></div>';
document.body.appendChild(lightbox);
const lightboxImg = lightbox.querySelector('img');
const lightboxInner = lightbox.querySelector('.dg-inner');

// Delegación de eventos para imágenes estáticas y dinámicas
document.body.addEventListener('click', (event) => {
  if (event.target.matches('.shot img, .proof-photos img')) {
    const img = event.target;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || '';
    lightbox.classList.add('open');
  }
});

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox || event.target === lightboxInner) {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lightbox.classList.contains('open')) {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
  }
});