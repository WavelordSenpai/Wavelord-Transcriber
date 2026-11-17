export async function handler(event){
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' };
  try{
    if(event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'{}' };
    const { url } = JSON.parse(event.body||'{}');
    if(!url) return { statusCode:400, headers, body: JSON.stringify({ error:'No URL provided' }) };
    const cobalt = await fetch('https://api.cobalt.tools/api/json', {
      method:'POST',
      headers:{ 'Accept':'application/json','Content-Type':'application/json' },
      body: JSON.stringify({ url, downloadMode:'audio', audioFormat:'mp3' })
    });
    const data = await cobalt.json().catch(()=>({}));
    if(data.url) return { statusCode:200, headers, body: JSON.stringify({ audioUrl:data.url, picker:data.picker }) };
    return { statusCode:200, headers, body: JSON.stringify({ error:'No audio extracted - no direct audio found', useCaptions:true }) };
  }catch(e){
    return { statusCode:200, headers, body: JSON.stringify({ error:e.message, useCaptions:true }) };
  }
}
