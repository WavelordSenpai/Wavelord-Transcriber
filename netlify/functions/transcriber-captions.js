exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' };
  try{
    if(event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'{}' };
    const { url } = JSON.parse(event.body||'{}');
    if(!url) return { statusCode:400, headers, body: JSON.stringify({ error:'No URL' }) };

    let videoId = null;
    let cleanUrl = url.trim();
    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /shorts\/([A-Za-z0-9_-]{11})/,
      /live\/([A-Za-z0-9_-]{11})/,
      /embed\/([A-Za-z0-9_-]{11})/,
      /\/v\/([A-Za-z0-9_-]{11})/,
      /watch\/([A-Za-z0-9_-]{11})/,
    ];
    for(let p of patterns){ let m = cleanUrl.match(p); if(m){ videoId = m[1]; break; } }
    if(!videoId && /^[A-Za-z0-9_-]{11}$/.test(cleanUrl)) videoId = cleanUrl;
    if(!videoId) return { statusCode:400, headers, body: JSON.stringify({ error:'Could not find a Video ID in that link.' }) };

    const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const getTextFromAny = (d) => {
      if(!d) return '';
      if(typeof d === 'string') return d;
      // FreeTranscriptAPI shapes
      if(d.transcript) return typeof d.transcript === 'string' ? d.transcript : (d.transcript.text || '');
      if(d.text) return d.text;
      if(d.data?.transcript) return typeof d.data.transcript === 'string' ? d.data.transcript : '';
      if(d.data?.text) return d.data.text;
      // FetchAPI shapes
      if(d.segments && Array.isArray(d.segments)) return d.segments.map(s=>s.text||'').join(' ');
      if(d.transcript_segments) return d.transcript_segments.map(s=>s.text||'').join(' ');
      if(Array.isArray(d)) return d.map(s=>s.text||s||'').join(' ');
      return '';
    };

    // TRY 1 - HOSTED TRANSCRIPT SERVICES - these have IPs YouTube allows, Netlify does not
    // Free, no API key needed, 20/hr
    const hosted = [
      `https://api.freetranscriptapi.com/v1/transcript?video_url=${videoId}`,
      `https://api.freetranscriptapi.com/v1/transcript?video_url=${encodeURIComponent(fullUrl)}`,
      `https://fetchapi.tech/v1/transcript?url=${encodeURIComponent(fullUrl)}`,
    ];
    for(let u of hosted){
      try{
        const r = await fetch(u, { headers:{ 'User-Agent':'Mozilla/5.0' } });
        if(!r.ok) continue;
        const d = await r.json().catch(()=>null);
        let t = getTextFromAny(d);
        // Some return {transcript: [{text, start}]} etc - already handled
        // Some return plain segments in different keys
        if(!t && d && typeof d === 'object'){
          for(let k of Object.keys(d)){
            if(Array.isArray(d[k]) && d[k][0]?.text){ t = d[k].map(s=>s.text).join(' '); break; }
          }
        }
        t = (t||'').replace(/\s+/g,' ').trim();
        if(t && t.length > 20) return { statusCode:200, headers, body: JSON.stringify({ text:t, captions:t, source:'hosted-transcript-api', videoId }) };
      }catch(e){}
    }

    // TRY 2 - Direct YouTube Player API (works sometimes)
    const clean = (j) => {
      if(!j || !j.events) return '';
      return j.events.map(ev=> (ev.segs||[]).map(s=>s.utf8).join('')).join(' ').replace(/\s+/g,' ').trim();
    };
    try{
      const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'User-Agent':'Mozilla/5.0' },
        body: JSON.stringify({ context:{ client:{ clientName:'ANDROID', clientVersion:'19.09.37', hl:'en', gl:'US' } }, videoId: videoId })
      });
      const player = await playerRes.json().catch(()=>null);
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if(tracks?.length){
        for(let tr of tracks){
          if(!tr.baseUrl) continue;
          try{
            const cr = await fetch(tr.baseUrl + '&fmt=json3', { headers:{ 'User-Agent':'Mozilla/5.0' } });
            const cj = await cr.json().catch(()=>null);
            const t = clean(cj);
            if(t) return { statusCode:200, headers, body: JSON.stringify({ text:t, captions:t, source:'youtube-player-api', videoId }) };
          }catch(e){}
        }
      }
    }catch(e){}

    // TRY 3 - Direct timedtext
    const tries = [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=json3`,
    ];
    for(let u of tries){
      try{
        const yt = await fetch(u, { headers:{ 'User-Agent':'Mozilla/5.0' } });
        if(yt.ok){ const j = await yt.json().catch(()=>null); const text = clean(j); if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-captions', videoId }) }; }
      }catch(e){}
    }

    return { statusCode:404, headers, body: JSON.stringify({ error:'No captions found for this video (ID: '+videoId+'). YouTube is blocking servers from reading this video. Try Upload instead - that always works.' }) };
  }catch(e){
    return { statusCode:500, headers, body: JSON.stringify({ error:e.message }) };
  }
};
