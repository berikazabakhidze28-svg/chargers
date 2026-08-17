const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.main-nav');
document.querySelectorAll('.header-cta[href="/map/"],.quick-links a[href="/map/"],.map-preview[href="/map/"]').forEach(link=>link.href='/chargers/');
menuButton?.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.product-image img').forEach(image => {
  image.addEventListener('error', () => { image.src = '/logo-mark.png'; }, {once:true});
});

if(!document.querySelector('script[data-chargerx-i18n]')){const i18n=document.createElement('script');i18n.src='/assets/i18n.js?v=4';i18n.dataset.chargerxI18n='';document.head.append(i18n)}
