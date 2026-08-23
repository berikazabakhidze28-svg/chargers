const config=window.CHARGERX_SUPABASE;
const client=window.supabase.createClient(config.url,config.publishableKey);
const form=document.querySelector('[data-info-settings]');
const fields=['phone','email','whatsapp','viber','facebook','tiktok','address','map_embed_url'];

const safeMapUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:''}catch{return ''}};
function updatePreview(){const wrapper=document.querySelector('[data-map-preview]'),frame=wrapper?.querySelector('iframe'),url=safeMapUrl(form.elements.map_embed_url.value.trim());if(!wrapper||!frame)return;wrapper.hidden=!url;if(url)frame.src=url;else frame.removeAttribute('src')}
async function requireAdmin(){const {data:{session}}=await client.auth.getSession();if(!session){location.replace('/login/');return null}document.querySelector('[data-admin-email]').textContent=session.user.email;return session}
async function loadInfo(){const message=form.querySelector('[data-info-message]'),{data,error}=await client.from('site_settings').select(fields.join(',')).eq('id',1).maybeSingle();if(error){message.textContent=error.message;return}fields.forEach(name=>form.elements[name].value=data?.[name]||'');updatePreview()}
form.addEventListener('input',event=>{if(event.target.name==='map_embed_url')updatePreview()});
form.addEventListener('submit',async event=>{event.preventDefault();const message=form.querySelector('[data-info-message]'),data=new FormData(form),payload={id:1,updated_at:new Date().toISOString()};fields.forEach(name=>payload[name]=String(data.get(name)||'').trim()||null);if(payload.map_embed_url&&!safeMapUrl(payload.map_embed_url)){message.textContent='რუკის ბმული უნდა იწყებოდეს https://-ით';return}message.textContent='ინახება…';const {error}=await client.from('site_settings').upsert(payload);message.textContent=error?error.message:'შენახულია ✓'});
document.querySelector('[data-sign-out]').addEventListener('click',async()=>{await client.auth.signOut();location.replace('/login/')});
requireAdmin().then(session=>{if(session)loadInfo()});