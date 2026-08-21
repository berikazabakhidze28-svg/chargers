const siteHeader = document.querySelector('.site-header');
if (siteHeader && !document.querySelector('.site-topbar')) {
  const topbar = document.createElement('div');
  topbar.className = 'site-topbar';
  topbar.setAttribute('aria-label', 'საკონტაქტო ინფორმაცია');
  topbar.innerHTML = '<a href="tel:+995551546446">☎ <span>+995 551 54 64 46</span></a><a href="mailto:info@chargerx.ge">✉ <span>info@chargerx.ge</span></a>';
  siteHeader.before(topbar);
}
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.main-nav');
document.querySelectorAll('.quick-links a[href="/map/"],.map-preview[href="/map/"]').forEach(link=>link.href='/chargers/');
menuButton?.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.product-image img').forEach(image => {
  image.addEventListener('error', () => { image.src = '/logo-mark.png'; }, {once:true});
});

if(!document.querySelector('script[data-chargerx-i18n]')){const i18n=document.createElement('script');i18n.src='/assets/i18n.js?v=4';i18n.dataset.chargerxI18n='';document.head.append(i18n)}
