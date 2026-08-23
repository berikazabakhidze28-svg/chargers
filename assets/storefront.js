const fallbackProducts = window.CHARGERX_PRODUCTS || [];
let products = fallbackProducts;
const money = value => `₾ ${Number(value).toLocaleString('ka-GE')}`;
const normalize = row => ({id:row.id,name:row.name,category:row.category,categoryLabel:row.category_label,price:Number(row.price),oldPrice:row.old_price==null?null:Number(row.old_price),image:row.image_url||'/logo-mark.png',badge:row.badge,models:row.models||[],description:row.description||''});

async function loadProducts(){
  try{
    const response=await fetch('https://vlgwjmrmqfenuglnlqoz.supabase.co/rest/v1/products?select=*&is_active=eq.true&order=sort_order.asc,id.asc',{headers:{apikey:'sb_publishable_knrYQKfXWdJGVzdcWSnScA_KqLLr0pf'}});
    if(!response.ok)throw new Error('Product request failed');
    const rows=await response.json();
    if(rows.length)products=rows.map(normalize);
  }catch(error){console.warn('ChargerX: fallback catalog is active.',error)}
}

async function loadContactLinks(){
  const fallback={whatsapp:'995551546446',viber:'995551546446'};
  try{
    const config=window.CHARGERX_SUPABASE;
    if(!config)return fallback;
    const response=await fetch(`${config.url}/rest/v1/site_settings?id=eq.1&select=whatsapp,viber`,{headers:{apikey:config.publishableKey}});
    if(!response.ok)throw new Error('Contact settings request failed');
    return {...fallback,...((await response.json())[0]||{})};
  }catch(error){console.warn('ChargerX: fallback contact links are active.',error);return fallback}
}
const card=product=>{const discounted=Number.isFinite(product.oldPrice)&&product.oldPrice>product.price,badge=product.badge||(discounted?'ფასდაკლება':'');return `<article class="product-card" data-category="${product.category}"><a class="product-card-link" href="/product/?id=${product.id}"><div class="product-image"><img src="${product.image}" alt="${product.name}" loading="lazy">${badge?`<span>${badge}</span>`:''}</div><h3>${product.name}</h3></a><div class="product-card-footer"><div class="product-prices">${discounted?`<del>${money(product.oldPrice)}</del>`:''}<strong>${money(product.price)}</strong></div><a class="product-order" href="https://wa.me/995551546446?text=${encodeURIComponent(`გამარჯობა, მაინტერესებს ${product.name}`)}" target="_blank" rel="noopener" data-ka="შეკვეთა" data-en="Order" data-ru="Заказать">შეკვეთა</a></div></article>`};const getCart=()=>JSON.parse(localStorage.getItem('chargerx-cart')||'[]');
const setCart=cart=>{localStorage.setItem('chargerx-cart',JSON.stringify(cart));updateCartCount()};
const updateCartCount=()=>document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=getCart().reduce((sum,item)=>sum+item.qty,0));

function setupCatalog(){
  const grid=document.querySelector('[data-product-grid]');if(!grid)return;
  const limit=Number(grid.dataset.limit||products.length);
  const render=list=>grid.innerHTML=list.slice(0,limit).map(card).join('')||'<div class="empty-state">პროდუქტი ვერ მოიძებნა.</div>';
  const filterProducts=()=>{const query=document.querySelector('[data-product-search]')?.value.trim().toLowerCase()||'',filter=document.querySelector('[data-filter].active')?.dataset.filter||'all';render(products.filter(p=>(filter==='all'||p.category===filter)&&p.name.toLowerCase().includes(query)))};
  render(products);
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));button.classList.add('active');filterProducts()}));
  document.querySelector('[data-product-search]')?.addEventListener('input',filterProducts);
}

async function setupDetail(){
  const root=document.querySelector('[data-product-detail]');if(!root)return;
  const id=Number(new URLSearchParams(location.search).get('id')),product=products.find(x=>x.id===id)||products[0];
  if(!product){root.innerHTML='<div class="empty-state">პროდუქტი ვერ მოიძებნა.</div>';return}
  document.title=`${product.name} — ChargerX`;
  const contactLinks=await loadContactLinks(),whatsappNumber=String(contactLinks.whatsapp||'').replace(/\D/g,''),viberNumber=String(contactLinks.viber||'').replace(/\D/g,''),message=encodeURIComponent('გამარჯობა, მაინტერესებს '+product.name);

  root.innerHTML=`<div class="detail-image"><img src="${product.image}" alt="${product.name}"></div><div class="detail-copy"><a class="back-link" href="/">← მაღაზიაში დაბრუნება</a><small>${product.categoryLabel}</small><h1>${product.name}</h1><div class="detail-price">${product.oldPrice>product.price?`<del>${money(product.oldPrice)}</del>`:``}<strong>${money(product.price)}</strong></div><p class="detail-description">${product.description}</p><div class="compatibility"><span>თავსებადობა</span><p>${product.models.join(' · ')||'დეტალები დასაზუსტებელია'}</p></div><div class="detail-actions detail-contact-actions">${whatsappNumber?`<a class="button detail-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${whatsappNumber}?text=${message}">WhatsApp</a>`:``}${viberNumber?`<a class="button detail-viber" href="viber://chat?number=%2B${viberNumber}">Viber</a>`:``}</div><div class="detail-share"><span>გაზიარება:</span><button type="button" data-copy-product-link aria-label="პროდუქტის ლინკის კოპირება"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 15.4a4 4 0 0 1 0-5.7l3-3a4 4 0 0 1 5.7 5.7l-1.4 1.4-1.4-1.4 1.4-1.4a2 2 0 1 0-2.8-2.8l-3 3a2 2 0 0 0 0 2.8l-1.5 1.4Zm6.8-6.8a4 4 0 0 1 0 5.7l-3 3a4 4 0 1 1-5.7-5.7l1.4-1.4 1.4 1.4L8.1 13a2 2 0 1 0 2.8 2.8l3-3a2 2 0 0 0 0-2.8l1.5-1.4Z"/></svg><span data-copy-label>ლინკის კოპირება</span></button></div></div>`;
}

function renderCart(){
  const root=document.querySelector('[data-cart]');if(!root)return;
  const cart=getCart();if(!cart.length){root.innerHTML='<div class="empty-state"><h2>კალათა ცარიელია</h2><p>შეარჩიე სასურველი პროდუქტი მაღაზიიდან.</p><a class="button primary" href="/shop/">მაღაზიაში გადასვლა</a></div>';return}
  const lines=cart.map(line=>({...line,product:products.find(p=>p.id===line.id)})).filter(x=>x.product),total=lines.reduce((sum,x)=>sum+x.product.price*x.qty,0);
  if(!lines.length){setCart([]);renderCart();return}
  const message=encodeURIComponent('გამარჯობა, მინდა შეკვეთა:\n'+lines.map(x=>`${x.product.name} × ${x.qty}`).join('\n')+`\nჯამი: ${money(total)}`);
  root.innerHTML=`<div class="cart-lines">${lines.map(x=>`<div class="cart-line"><img src="${x.product.image}" alt=""><div><small>${x.product.categoryLabel}</small><h3>${x.product.name}</h3><p>${money(x.product.price)} × ${x.qty}</p></div><button data-remove-cart="${x.product.id}">წაშლა</button></div>`).join('')}</div><aside class="cart-summary"><small>შეკვეთის ჯამი</small><strong>${money(total)}</strong><a class="button primary" target="_blank" rel="noopener" href="https://wa.me/995551546446?text=${message}">WhatsApp-ით შეკვეთა</a><p>შეკვეთის დეტალები ავტომატურად ჩაიწერება შეტყობინებაში.</p></aside>`;
}

document.addEventListener('click',async event=>{
  const copyButton=event.target.closest('[data-copy-product-link]');if(!copyButton)return;
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(location.href);
    else{const field=document.createElement('textarea');field.value=location.href;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();document.execCommand('copy');field.remove()}
    const label=copyButton.querySelector('[data-copy-label]');if(label){const original=label.textContent;label.textContent='დაკოპირდა ✓';setTimeout(()=>label.textContent=original,1800)}
  }catch(error){console.warn('ChargerX: product link could not be copied.',error)}
});
document.addEventListener('click',event=>{
  const add=event.target.closest('[data-add-cart]');if(add){const id=Number(add.dataset.addCart),cart=getCart(),line=cart.find(x=>x.id===id);line?line.qty++:cart.push({id,qty:1});setCart(cart);add.textContent='დამატებულია ✓'}
  const remove=event.target.closest('[data-remove-cart]');if(remove){setCart(getCart().filter(x=>x.id!==Number(remove.dataset.removeCart)));renderCart()}
});

(async()=>{await loadProducts();setupCatalog();setupDetail();renderCart();updateCartCount()})();
