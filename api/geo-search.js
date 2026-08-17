const send=(response,status,body)=>response.status(status).setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=3600').json(body);
module.exports=async function handler(request,response){
  if(request.method!=='GET')return send(response,405,{error:'Method not allowed'});
  const query=String(request.query.q||'').trim();
  if(query.length<2||query.length>160)return send(response,400,{error:'Invalid query'});
  const key=process.env.TOMTOM_API_KEY;
  if(!key)return send(response,503,{error:'Search is not configured'});
  const params=new URLSearchParams({key,limit:'7',countrySet:'GE',view:'Unified'});
  try{const upstream=await fetch(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?${params}`);if(!upstream.ok)return send(response,upstream.status,{error:'Search unavailable'});const data=await upstream.json();return send(response,200,{results:(data.results||[]).map(item=>({id:item.id,position:item.position,poi:item.poi?{name:item.poi.name}:null,address:{streetName:item.address?.streetName||'',streetNumber:item.address?.streetNumber||'',municipality:item.address?.municipality||item.address?.localName||'',country:item.address?.country||'',freeformAddress:item.address?.freeformAddress||''}}))})}catch(error){return send(response,502,{error:'Search unavailable'})}
}
