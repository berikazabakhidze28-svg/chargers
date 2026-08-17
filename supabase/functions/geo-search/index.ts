const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"public, max-age=300"}});

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="GET")return json({error:"Method not allowed"},405);
  const input=new URL(request.url),query=input.searchParams.get("q")?.trim()||"";
  if(query.length<2||query.length>160)return json({error:"Invalid query"},400);
  const key=Deno.env.get("TOMTOM_API_KEY");if(!key)return json({error:"Search is not configured"},503);
  const lat=Number(input.searchParams.get("lat")),lon=Number(input.searchParams.get("lon")),hasLocation=Number.isFinite(lat)&&Number.isFinite(lon);
  const params=new URLSearchParams({key,limit:"7",countrySet:"GE",view:"Unified"});
  if(hasLocation){params.set("lat",String(lat));params.set("lon",String(lon));params.set("radius","150000");params.set("typeahead","false")}
  try{
    const endpoint=hasLocation?"search":"geocode";
    const upstream=await fetch(`https://api.tomtom.com/search/2/${endpoint}/${encodeURIComponent(query)}.json?${params}`);
    if(!upstream.ok)return json({error:"Search unavailable"},upstream.status);
    const data=await upstream.json();
    return json({results:(data.results||[]).map((item:any)=>({id:item.id,position:item.position,poi:item.poi?{name:item.poi.name}:null,address:{streetName:item.address?.streetName||"",streetNumber:item.address?.streetNumber||"",municipality:item.address?.municipality||item.address?.localName||"",country:item.address?.country||"",freeformAddress:item.address?.freeformAddress||""}}))});
  }catch{return json({error:"Search unavailable"},502)}
});
