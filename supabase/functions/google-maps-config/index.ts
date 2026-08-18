const allowedOrigins=new Set([
  'https://chargerx.ge',
  'https://www.chargerx.ge',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://localhost:8080'
]);

Deno.serve((request)=>{
  const origin=request.headers.get('origin')||'';
  if(origin&&!allowedOrigins.has(origin))return new Response('Forbidden',{status:403});
  const headers={
    'Access-Control-Allow-Origin':origin||'https://chargerx.ge',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Vary':'Origin',
    'Content-Type':'application/json',
    'Cache-Control':'no-store'
  };
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  const key=Deno.env.get('GOOGLE_MAPS_API_KEY');
  if(!key)return new Response(JSON.stringify({error:'Missing configuration'}),{status:500,headers});
  return new Response(JSON.stringify({key}),{headers});
});
