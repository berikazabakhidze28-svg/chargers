const cfg=window.CHARGERX_SUPABASE;
document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="/assets/admin-nav.css">');
const db=window.supabase.createClient(cfg.url,cfg.publishableKey);
const root=document.querySelector('[data-chargers]');
const modal=document.querySelector('[data-charger-modal]');
const form=document.querySelector('[data-charger-form]');
let editingId=null;
let pickerMap=null;
let pickerMarker=null;
const georgiaCenter=[43.45,42.05];

function setPickerLocation(latitude,longitude,moveMap=true){
  const lat=Number(latitude),lng=Number(longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  form.elements.latitude.value=lat.toFixed(7);
  form.elements.longitude.value=lng.toFixed(7);
  if(!pickerMarker){const element=document.createElement('div');element.className='location-picker-marker';pickerMarker=new maplibregl.Marker({element,draggable:true}).setLngLat([lng,lat]).addTo(pickerMap);pickerMarker.on('dragend',()=>{const point=pickerMarker.getLngLat();setPickerLocation(point.lat,point.lng,false)})}else pickerMarker.setLngLat([lng,lat]);
  if(moveMap)pickerMap.flyTo({center:[lng,lat],zoom:15});
}

function initLocationPicker(latitude,longitude){
  if(!pickerMap){pickerMap=new maplibregl.Map({container:'charger-location-picker',center:georgiaCenter,zoom:7,style:{version:8,sources:{osm:{type:'raster',tiles:['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap'}},layers:[{id:'osm',type:'raster',source:'osm'}]}});pickerMap.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');pickerMap.on('click',event=>setPickerLocation(event.lngLat.lat,event.lngLat.lng,false))}
  requestAnimationFrame(()=>{pickerMap.resize();if(latitude!==''&&longitude!=='')setPickerLocation(latitude,longitude,true);else{pickerMarker?.remove();pickerMarker=null;pickerMap.jumpTo({center:georgiaCenter,zoom:7})}});
}

async function requireSession(){const {data:{session}}=await db.auth.getSession();if(!session){location.replace('/login/');return null}document.querySelector('[data-admin-email]').textContent=session.user.email;return session}
const value=(name,item,fallback='')=>form.elements[name].value=item?.[name]??fallback;
function openForm(item=null){editingId=item?.id||null;form.reset();value('name',item);value('address',item);value('city',item);value('latitude',item);value('longitude',item);value('charger_type',item,'AC');value('connector_types',item,(item?.connector_types||[]).join(', '));value('power_kw',item);value('ports',item,1);value('operator',item);value('working_hours',item,'24/7');value('price_info',item);value('notes',item);form.elements.is_active.checked=item?.is_active??true;document.querySelector('[data-modal-title]').textContent=item?'ლოკაციის შეცვლა':'ახალი ლოკაცია';modal.hidden=false;initLocationPicker(form.elements.latitude.value,form.elements.longitude.value)}
async function load(){root.innerHTML='<div class="admin-loading">იტვირთება…</div>';const {data,error}=await db.from('chargers').select('*').order('city').order('name');if(error){root.innerHTML=`<div class="admin-loading">${error.message}</div>`;return}root.innerHTML=data.map(x=>`<div class="charger-row"><div><strong>${x.name}</strong><small>${x.city}${x.address?' · '+x.address:''}</small></div><span>${x.charger_type} · ${x.power_kw??'—'} kW</span><span>${x.latitude.toFixed(5)}, ${x.longitude.toFixed(5)}</span><span>${x.is_active?'აქტიური':'დამალული'}</span><div class="row-actions"><a target="_blank" href="https://www.google.com/maps?q=${x.latitude},${x.longitude}">რუკა</a><button data-edit="${x.id}">შეცვლა</button><button class="danger" data-delete="${x.id}">წაშლა</button></div></div>`).join('')||'<div class="admin-loading">ლოკაციები ჯერ არ არის დამატებული.</div>'}
document.querySelector('[data-new-charger]').onclick=()=>openForm();document.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=()=>modal.hidden=true);
document.querySelector('[data-my-location]').onclick=()=>navigator.geolocation?.getCurrentPosition(position=>setPickerLocation(position.coords.latitude,position.coords.longitude,true),()=>alert('მდებარეობის მიღება ვერ მოხერხდა.'));
form.elements.latitude.addEventListener('change',()=>setPickerLocation(form.elements.latitude.value,form.elements.longitude.value,true));
form.elements.longitude.addEventListener('change',()=>setPickerLocation(form.elements.latitude.value,form.elements.longitude.value,true));
form.addEventListener('submit',async event=>{event.preventDefault();const message=form.querySelector('[data-message]'),fd=new FormData(form);message.textContent='ინახება…';const payload={name:fd.get('name'),address:fd.get('address'),city:fd.get('city'),latitude:Number(fd.get('latitude')),longitude:Number(fd.get('longitude')),charger_type:fd.get('charger_type'),connector_types:String(fd.get('connector_types')).split(',').map(x=>x.trim()).filter(Boolean),power_kw:fd.get('power_kw')?Number(fd.get('power_kw')):null,ports:Number(fd.get('ports')),operator:fd.get('operator')||null,working_hours:fd.get('working_hours'),price_info:fd.get('price_info')||null,notes:fd.get('notes')||null,is_active:fd.get('is_active')==='on'};const query=editingId?db.from('chargers').update(payload).eq('id',editingId):db.from('chargers').insert(payload);const {error}=await query;if(error){message.textContent=error.message;return}modal.hidden=true;load()});
root.addEventListener('click',async event=>{const edit=event.target.closest('[data-edit]'),remove=event.target.closest('[data-delete]');if(edit){const {data}=await db.from('chargers').select('*').eq('id',edit.dataset.edit).single();if(data)openForm(data)}if(remove&&confirm('ნამდვილად წავშალოთ ლოკაცია?')){await db.from('chargers').delete().eq('id',remove.dataset.delete);load()}});
document.querySelector('.admin-top nav')?.insertAdjacentHTML('afterbegin','<a class="admin-nav-link" href="/admin/">პროდუქტები</a><a class="admin-nav-link active" href="/admin/chargers/">დამტენები</a>');
document.querySelector('[data-sign-out]').onclick=async()=>{await db.auth.signOut();location.replace('/login/')};requireSession().then(session=>{if(session)load()});
