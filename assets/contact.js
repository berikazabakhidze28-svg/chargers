(() => {
  const panel=document.querySelector('.contact-panel');
  if(!panel)return;
  const safeMapUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:''}catch{return ''}};
  const socialHref=(type,value)=>{if(/^https?:\/\//i.test(value)||/^[a-z]+:\/\//i.test(value))return value;const number=value.replace(/\D/g,'');return type==='whatsapp'?`https://wa.me/${number}`:`viber://chat?number=${number}`};
  const render=settings=>{
    if(panel.dataset.ready)return;
    panel.dataset.ready='true';
    const address=settings.address||'ანგია ბოჭორიშვილის ქუჩა 39, თბილისი 0100';
    const phone=settings.phone||'+995 551 54 64 46';
    const email=settings.email||'info@chargerx.ge';
    const mapUrl=safeMapUrl(settings.map_embed_url||'');
    const addressLink=panel.querySelector('[data-contact-address-link]');
    addressLink.href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    panel.querySelector('[data-contact-address]').textContent=address;
    const phoneLink=panel.querySelector('[data-contact-phone]');
    phoneLink.href=`tel:${String(phone).replace(/[^+\d]/g,'')}`;
    panel.querySelector('[data-contact-phone-text]').textContent=phone;
    const emailLink=panel.querySelector('[data-contact-email]');
    emailLink.href=`mailto:${email}`;
    panel.querySelector('[data-contact-email-text]').textContent=email;
    panel.querySelectorAll('[data-contact-social]').forEach(link=>{const type=link.dataset.contactSocial,value=String(settings[type]||'').trim();if(!value)return;link.href=(type==='whatsapp'||type==='viber')?socialHref(type,value):value;link.hidden=false});
    const map=panel.querySelector('[data-contact-map]'),frame=map.querySelector('iframe'),directions=map.querySelector('[data-contact-directions]');
    if(mapUrl){frame.src=mapUrl;let destination='';try{destination=new URL(mapUrl).searchParams.get('q')||''}catch{}const coordinates=destination.split(',').map(Number);if(coordinates.length===2&&coordinates.every(Number.isFinite))directions.href=`/map/?lat=${coordinates[0]}&lng=${coordinates[1]}&label=${encodeURIComponent(address)}`;else directions.href=`/map/?label=${encodeURIComponent(address)}`}else map.hidden=true;
  };
  if(window.CHARGERX_SITE_SETTINGS)render(window.CHARGERX_SITE_SETTINGS);
  else window.addEventListener('chargerx:settings',event=>render(event.detail),{once:true});
})();