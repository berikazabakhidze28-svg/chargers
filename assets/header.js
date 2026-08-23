(() => {
  const mount = document.querySelector('[data-site-header]');
  if (!mount) return;

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const section = path.startsWith('/chargers')
    ? 'chargers'
    : path.startsWith('/contact')
      ? 'contact'
      : path.startsWith('/map')
        ? 'map'
        : 'shop';

  const links = [
    { key: 'shop', href: '/', ka: 'მაღაზია', en: 'Shop', ru: 'Магазин' },
    { key: 'contact', href: '/contact/', ka: 'კონტაქტი', en: 'Contact', ru: 'Контакты' }
  ];

  const navigation = links.map(link => `
    <a${section === link.key ? ' class="active"' : ''} href="${link.href}" data-ka="${link.ka}" data-en="${link.en}" data-ru="${link.ru}">${link.ka}</a>
  `).join('');

  mount.outerHTML = `
    <header class="site-header">
      <a class="brand" href="/" aria-label="ChargerX მთავარი გვერდი">
        <img class="brand-logo" src="/log.jpeg" alt="ChargerX">
      </a>
      <nav class="main-nav" aria-label="მთავარი ნავიგაცია">
        ${navigation}
        <a class="nav-map-link${section === 'map' ? ' active' : ''}" href="/map/" aria-label="ნავიგაცია" title="ნავიგაცია">
          <img src="/assets/compass.png" alt="">
        </a>
      </nav>
    </header>
  `;
})(); 