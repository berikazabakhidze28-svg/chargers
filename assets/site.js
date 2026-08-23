const siteHeader = document.querySelector('.site-header');
if (siteHeader && !document.querySelector('.site-topbar')) {
  const topbar = document.createElement('div');
  topbar.className = 'site-topbar';
  topbar.setAttribute('aria-label', 'საკონტაქტო ინფორმაცია');
  topbar.innerHTML = '<a data-site-phone href="tel:+995551546446">☎ <span>+995 551 54 64 46</span></a><a data-site-email href="mailto:info@chargerx.ge">✉ <span>info@chargerx.ge</span></a>';
  siteHeader.before(topbar);
}
if(!document.querySelector('.social-rail')){
  const social=document.createElement('aside');social.className='social-rail';social.hidden=true;social.setAttribute('aria-label','სოციალური ქსელები');
  social.innerHTML=`<a class="social-facebook" data-social="facebook" href="#" hidden target="_blank" rel="noopener" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.2c-.5-.1-2.2-.2-4.1-.2-4 0-6.7 2.4-6.7 6.9V15H2v4.7h4.2V24h5.1v-4.3h4.2L16.2 15h-4.9v-3.6C11.3 10 11.7 8 14 8Z"/></svg></a><a class="social-whatsapp" data-social="whatsapp" href="#" hidden target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.8 9.8 0 0 0-8.5 14.7L2 22l5.4-1.4A10 10 0 1 0 12 2Zm0 18.2a8 8 0 0 1-4.1-1.1l-.3-.2-3.2.8.9-3.1-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.4-.7-2.4-1.3-3.3-2.9-.2-.3.2-.3.6-1.1.1-.2.1-.4 0-.5l-.8-1.9c-.2-.5-.5-.4-.7-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.7 1.2 2.9c.1.2 2 3.1 5 4.3 1.8.8 2.5.8 3.4.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.3-.5-.4Z"/></svg></a><a class="social-viber" data-social="viber" href="#" hidden aria-label="Viber" title="Viber"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.5 2 2.4 5.8 2.4 11.2c0 2.8 1 5.2 2.8 6.9L4.4 22l4-1.4c1.1.4 2.3.6 3.6.6 5.5 0 9.6-3.8 9.6-9.2S17.5 2 12 2Zm4.8 14.2c-.4.8-1.3 1.3-2.2 1.1-2.4-.6-4.4-1.9-5.9-3.8-1.2-1.5-2-3.1-2.2-4.8-.1-.9.4-1.8 1.2-2.2.3-.1.7 0 .9.3l1.2 2.3c.1.3.1.6-.1.8l-.7.8c.7 1.4 1.8 2.5 3.2 3.2l.8-.8c.2-.2.5-.3.8-.1l2.4 1.2c.6.3.8 1.2.6 2Z"/></svg></a><a class="social-tiktok" data-social="tiktok" href="#" hidden target="_blank" rel="noopener" aria-label="TikTok" title="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.4 2h3.1c.2 1.7 1.2 3.2 2.7 4.1V9a9 9 0 0 1-2.8-.7v6.3a6.4 6.4 0 1 1-5.5-6.3v3.2a3.3 3.3 0 1 0 2.5 3.2V2Z"/></svg></a>`;document.body.append(social);
  const socialHref=(type,value)=>{if(/^https?:\/\//i.test(value)||/^[a-z]+:\/\//i.test(value))return value;const number=value.replace(/\D/g,'');return type==='whatsapp'?`https://wa.me/${number}`:type==='viber'?`viber://chat?number=${number}`:value};
  (async()=>{try{const config=window.CHARGERX_SUPABASE;if(!config)throw new Error('Missing config');const response=await fetch(`${config.url}/rest/v1/site_settings?id=eq.1&select=whatsapp,viber,tiktok,facebook`,{headers:{apikey:config.publishableKey}});if(!response.ok)throw new Error(`HTTP ${response.status}`);let settings=(await response.json())[0]||{};try{const infoResponse=await fetch(`${config.url}/rest/v1/site_settings?id=eq.1&select=phone,email,address,map_embed_url`,{headers:{apikey:config.publishableKey}});if(infoResponse.ok)settings={...settings,...((await infoResponse.json())[0]||{})}}catch{}settings={phone:'+995 551 54 64 46',email:'info@chargerx.ge',...settings};const phone=document.querySelector('[data-site-phone]'),email=document.querySelector('[data-site-email]'),links=social.querySelectorAll('[data-social]');if(phone&&settings.phone){phone.href=`tel:${String(settings.phone).replace(/[^+\d]/g,'')}`;phone.querySelector('span').textContent=settings.phone}if(email&&settings.email){email.href=`mailto:${settings.email}`;email.querySelector('span').textContent=settings.email}window.CHARGERX_SITE_SETTINGS=settings;window.dispatchEvent(new CustomEvent('chargerx:settings',{detail:settings}));let visible=0;links.forEach(link=>{const type=link.dataset.social,value=String(settings[type]||'').trim();if(!value)return;link.href=socialHref(type,value);link.hidden=false;visible++});if(visible)social.hidden=false;else social.remove()}catch(error){social.remove();console.warn('ChargerX: social links unavailable.',error)}})();
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

if(!document.querySelector('script[data-chargerx-i18n]')){const i18n=document.createElement('script');i18n.src='/assets/i18n.js?v=5';i18n.dataset.chargerxI18n='';document.head.append(i18n)}
