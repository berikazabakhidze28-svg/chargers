const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"private, no-store"}});

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="GET")return json({error:"Method not allowed"},405);
  const paramsIn=new URL(request.url).searchParams,from=paramsIn.get("from")||"",to=paramsIn.get("to")||"",point=/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;
  if(!point.test(from)||!point.test(to))return json({error:"Invalid coordinates"},400);
  const key=Deno.env.get("TOMTOM_API_KEY");if(!key)return json({error:"Routing is not configured"},503);
  const params=new URLSearchParams({key,traffic:"true",travelMode:"car",routeType:"fastest",instructionsType:"text"});
  try{
    const upstream=await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${from}:${to}/json?${params}`);
    if(!upstream.ok)return json({error:"Routing unavailable"},upstream.status);
    const data=await upstream.json(),route=data.routes?.[0];if(!route)return json({error:"No route"},404);
    const coordinates=route.legs.flatMap((leg:any,index:number)=>leg.points.map((point:any)=>[point.longitude,point.latitude]).slice(index?1:0));
    const guidance=(route.guidance?.instructions||[]).map((instruction:any)=>({
      message:instruction.message||"",
      maneuver:instruction.maneuver||"",
      routeOffset:instruction.routeOffsetInMeters||0,
      point:instruction.point?{lat:instruction.point.latitude,lng:instruction.point.longitude}:null
    }));
    return json({geometry:{type:"LineString",coordinates},distance:route.summary.lengthInMeters,duration:route.summary.travelTimeInSeconds,trafficDelay:route.summary.trafficDelayInSeconds||0,arrivalTime:route.summary.arrivalTime,guidance});
  }catch{return json({error:"Routing unavailable"},502)}
});
