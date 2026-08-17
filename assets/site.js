const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.main-nav');
menuButton?.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.product-image img').forEach(image => {
  image.addEventListener('error', () => { image.src = '/logo-mark.png'; }, {once:true});
});

// The home page uses the same live Supabase catalog as the shop.
if (location.pathname === '/' || location.pathname.endsWith('/index.html')) {
  const homeGrid = document.querySelector('.product-grid');
  if (homeGrid) {
    homeGrid.dataset.productGrid = '';
    homeGrid.dataset.limit = '4';
    const productsScript = document.createElement('script');
    productsScript.src = '/assets/products.js';
    productsScript.onload = () => {
      const storefrontScript = document.createElement('script');
      storefrontScript.src = '/assets/storefront.js';
      document.body.appendChild(storefrontScript);
    };
    document.body.appendChild(productsScript);
  }
}
if(!document.querySelector('script[data-chargerx-i18n]')){const i18n=document.createElement('script');i18n.src='/assets/i18n.js?v=3';i18n.dataset.chargerxI18n='';document.head.append(i18n)}
