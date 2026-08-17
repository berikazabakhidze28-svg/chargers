module.exports=async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({error:'Method not allowed'});
  const point=/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;
  const from=String(request.query.from||''),to=String(request.query.to||'');
  if(!point.test(from)||!point.test(to))return response.status(400).json({error:'Invalid coordinates'});
  const key=process.env.TOMTOM_API_KEY;if(!key)return response.status(503).json({error:'Routing is not configured'});
  const params=new URLSearchParams({key,traffic:'true',travelMode:'car',routeType:'fastest',instructionsType:'text'});
  try{const upstream=await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${from}:${to}/json?${params}`);if(!upstream.ok)return response.status(upstream.status).json({error:'Routing unavailable'});const data=await upstream.json(),route=data.routes?.[0];if(!route)return response.status(404).json({error:'No route'});const coordinates=route.legs.flatMap((leg,index)=>leg.points.map(point=>[point.longitude,point.latitude]).slice(index?1:0));return response.status(200).setHeader('Cache-Control','private, no-store').json({geometry:{type:'LineString',coordinates},distance:route.summary.lengthInMeters,duration:route.summary.travelTimeInSeconds,trafficDelay:route.summary.trafficDelayInSeconds||0,arrivalTime:route.summary.arrivalTime})}catch(error){return response.status(502).json({error:'Routing unavailable'})}
}
