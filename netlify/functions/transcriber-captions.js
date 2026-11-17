export async function handler(event){
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' };
  try{
    if(event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'{}' };
    const { url } = JSON.parse(event.body||'{}');
    if(!url) return { statusCode:400, headers, body: JSON.stringify({ error:'No URL' }) };

    // YouTube ID
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if(!m) return { statusCode:200, headers, body: JSON.stringify({ error:'Captions only supported for YouTube links right now. Use Voice Note / Upload for other platforms.', useCaptions:false }) };
    const videoId = m[1];

    // Try YouTube timedtext - public captions
    const yt = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`);
    if(yt.ok){
      const j = await yt.json().catch(()=>null);
      if(j && j.events){
        const text = j.events.map(ev=> (ev.segs||[]).map(s=>s.utf8).join('')).join(' ').replace(/\s+/g,' ').trim();
        if(text) return { statusCode:200, headers, body: JSON.stringify({ captions:text, source:'youtube-captions' }) };
      }
    }
    return { statusCode:200, headers, body: JSON.stringify({ error:'No captions found for this video. Video may have captions disabled or be auto-generated only.', useCaptions:false }) };
  }catch(e){
    return { statusCode:200, headers, body: JSON.stringify({ error:e.message }) };
  }
}
