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
    if(!videoId) return { statusCode:400, headers, body: JSON.stringify({ error:'Could not find a Video ID in that link. Paste a video link like youtube.com/watch?v=... not a channel link.' }) };

    const clean = (j) => {
      if(!j || !j.events) return '';
      return j.events.map(ev=> (ev.segs||[]).map(s=>s.utf8).join('')).join(' ').replace(/\s+/g,' ').trim();
    };

    const cleanXml = (xml) => {
      if(!xml) return '';
      return xml.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
    };

    // Helper: try to fetch a caption track URL in BOTH json3 and xml formats
    const tryTrack = async (baseUrl) => {
      const urls = [baseUrl + '&fmt=json3', baseUrl, baseUrl + '&fmt=json3&xorb=2&xobt=3&xov=3'];
      for(let u of urls){
        try{
          const r = await fetch(u, { headers:{ 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept-Language':'en-US,en;q=0.9' } });
          if(!r.ok) continue;
          const txt = await r.text();
          if(!txt) continue;
          // Try JSON first
          try{ const j = JSON.parse(txt); const t = clean(j); if(t) return t; }catch(e){}
          // Then XML
          const t2 = cleanXml(txt);
          if(t2 && t2.length > 20) return t2;
        }catch(e){}
      }
      return '';
    };

    // TRY 1 - THE NEW WAY: YouTube Player API (Innertube) - this is how the YouTube app gets captions
    // This is the one that works from Netlify when timedtext is blocked
    try{
      const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'User-Agent':'Mozilla/5.0' },
        body: JSON.stringify({
          context:{ client:{ clientName:'ANDROID', clientVersion:'19.09.37', androidSdkVersion:30, hl:'en', gl:'US' } },
          videoId: videoId,
          playbackContext:{ contentPlaybackContext:{ vis:0, splay:false, lactMilliseconds:-1, signatureTimestamp: 20000 } },
          racyCheckOk: true,
          contentCheckOk: true
        })
      });
      const player = await playerRes.json().catch(()=>null);
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if(tracks && tracks.length){
        // Prefer English, then auto English, then ANY track
        let track = tracks.find(t=>t.languageCode==='en' && !t.kind) || tracks.find(t=>t.languageCode==='en') || tracks.find(t=>t.languageCode && t.languageCode.startsWith('en')) || tracks[0];
        if(track?.baseUrl){
          const text = await tryTrack(track.baseUrl);
          if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-player-api', language: track.languageCode, videoId }) };
        }
        // If first track failed, try ALL tracks
        for(let tr of tracks){
          if(!tr.baseUrl) continue;
          const text = await tryTrack(tr.baseUrl);
          if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-player-api', language: tr.languageCode, videoId }) };
        }
      }
    }catch(e){}

    // TRY 2 - OLD WAY: Direct timedtext, in case Player API didn't work
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
          if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-captions', videoId }) };
        }
      }catch(e){}
    }

    // TRY 3 - Watch page captionTracks
    try{
      const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers:{ 'User-Agent':'Mozilla/5.0' } });
      const html = await page.text();
      const cm = html.match(/"captionTracks":(\[.*?\])/);
      if(cm){
        const tracks = JSON.parse(cm[1]);
        for(let tr of tracks){
          if(!tr.baseUrl) continue;
          const text = await tryTrack(tr.baseUrl);
          if(text) return { statusCode:200, headers, body: JSON.stringify({ text, captions:text, source:'youtube-watch-page', language: tr.languageCode, videoId }) };
        }
      }
    }catch(e){}

    return { statusCode:404, headers, body: JSON.stringify({ error:'No captions found for this video (ID: '+videoId+'). YouTube is blocking the server from reading captions for this video. Try Upload instead - download the audio and upload it, that always works.' }) };
  }catch(e){
    return { statusCode:500, headers, body: JSON.stringify({ error:e.message }) };
  }
};
