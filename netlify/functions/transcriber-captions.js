exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' };
  try{
    if(event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'{}' };
    const { url } = JSON.parse(event.body||'{}');
    if(!url) return { statusCode:400, headers, body: JSON.stringify({ error:'No URL' }) };

    // YouTube ID
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if(!m) return { statusCode:400, headers, body: JSON.stringify({ error:'Captions only supported for YouTube links right now. Use Voice Note / Upload for other platforms.' }) };
    const videoId = m[1];

    // Turn YouTube timedtext json3 into clean text
    const clean = (j) => {
      if(!j || !j.events) return '';
      return j.events.map(ev=> (ev.segs||[]).map(s=>s.utf8).join('')).join(' ').replace(/\s+/g,' ').trim();
    };

    // TRY 1-4: Manual + auto-generated captions, en + en-US
    const tries = [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&kind=asr&fmt=json3`,
    ];

    for(let u of tries){
      try{
        const yt = await fetch(u, { headers:{ 'User-Agent':'Mozilla/5.0' } });
        if(yt.ok){
          const j = await yt.json().catch(()=>null);
          const text = clean(j);
          if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-captions' }) };
        }
      }catch(e){}
    }

    // TRY 5: Get captionTracks from the watch page - finds whatever language the video actually has
    try{
      const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers:{ 'User-Agent':'Mozilla/5.0' } });
      const html = await page.text();
      const cm = html.match(/"captionTracks":(\[.*?\])/);
      if(cm){
        const tracks = JSON.parse(cm[1]);
        const track = tracks.find(t=>t.languageCode && t.languageCode.startsWith('en')) || tracks[0];
        if(track && track.baseUrl){
          const capRes = await fetch(track.baseUrl + '&fmt=json3', { headers:{ 'User-Agent':'Mozilla/5.0' } });
          const cap = await capRes.json().catch(()=>null);
          const text = clean(cap);
          if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-captions', language: track.languageCode }) };
        }
      }
    }catch(e){}

    return { statusCode:404, headers, body: JSON.stringify({ error:'No captions found for this video. Video may have captions disabled. Try another video, or use Upload.' }) };
  }catch(e){
    return { statusCode:500, headers, body: JSON.stringify({ error:e.message }) };
  }
};
