const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .14 });
    document.querySelectorAll('.rv').forEach(el => io.observe(el));

    const LIMIT = 6;
    let expanded = false;
    let current = 'todos';
    const tabs = document.querySelectorAll('.filter-tab');
    const cards = [...document.querySelectorAll('.bonsai-card')];
    const moreWrap = document.querySelector('.more-wrap');
    const moreBtn = document.getElementById('verMas');

    function render() {
      const matches = cards.filter(c => current === 'todos' || c.dataset.cat === current);
      cards.forEach(c => c.style.display = 'none');
      (expanded ? matches : matches.slice(0, LIMIT)).forEach(c => c.style.display = '');
      if (matches.length > LIMIT) {
        moreWrap.style.display = 'flex';
        moreBtn.textContent = expanded ? 'Ver menos' : `Ver más bonsáis (${matches.length - LIMIT})`;
      } else {
        moreWrap.style.display = 'none';
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        current = tab.dataset.filter;
        expanded = false;
        render();
      });
    });
    moreBtn.addEventListener('click', () => { expanded = !expanded; render(); });

    render();

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

    document.querySelectorAll('.shot img, .proof-photos img').forEach(img => {
      img.addEventListener('click', () => {
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt || '';
        lightbox.classList.add('open');
      });
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