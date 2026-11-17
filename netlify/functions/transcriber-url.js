// netlify/functions/transcriber-url.js
// NO KEY NEEDED VERSION - public Cobalt instance built in
// Flow stays INSIDE Wavelord: URL -> Cobalt API (background) -> MP3 -> Whisper -> Transcript

exports.handler = async (event) => {
  // If you later add COBALT_API_URL in Netlify, it will use yours.
  // If you don't, it uses this free public one - no key needed.
  const COBALT_URL = process.env.COBALT_API_URL || 'https://cobalt-backend.canine.tools';
  const COBALT_KEY = process.env.COBALT_API_KEY || ''; // empty = OK for public

  try{
    const { url } = JSON.parse(event.body || '{}');
    if(!url) return { statusCode:400, body: JSON.stringify({error:'No URL'}) };

    console.log('1. Cobalt request for:', url);

    // 1. Ask Cobalt for AUDIO ONLY - in background, user stays in Wavelord
    const cobaltRes = await fetch(COBALT_URL, {
      method:'POST',
      headers:{
        'Accept':'application/json',
        'Content-Type':'application/json',
        ...(COBALT_KEY ? { 'Authorization': `Api-Key ${COBALT_KEY}` } : {})
      },
      body: JSON.stringify({
        url,
        downloadMode: 'audio',
        audioFormat: 'mp3',
        audioBitrate: '128',
        filenameStyle: 'basic'
      })
    });

    const cobaltData = await cobaltRes.json();
    console.log('2. Cobalt returned:', JSON.stringify(cobaltData).slice(0,500));

    if(cobaltData.status === 'error'){
      return { statusCode:200, body: JSON.stringify({
        error:'COBALT_FAILED',
        message: 'Cobalt could not get audio from this link: ' + (cobaltData.error?.code || cobaltData.text || 'blocked').slice(0,200) + '. Try a different video, or use Upload / Voice Note.'
      }) };
    }

    const audioUrl = cobaltData.url;
    if(!audioUrl) return { statusCode:500, body: JSON.stringify({error:'Cobalt gave no audio URL'}) };

    // 2. Download the MP3 Cobalt gave us
    const audioRes = await fetch(audioUrl);
    if(!audioRes.ok) throw new Error('Could not download audio from Cobalt');
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    console.log('3. Got audio bytes:', audioBuffer.length);
    if(audioBuffer.length < 1000) throw new Error('Audio file too small from Cobalt');

    // 3. NOW send the REAL FILE to Whisper - this is what Whisper expects
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', audioBuffer, { filename:'audio.mp3', contentType:'audio/mpeg' });
    form.append('model', 'whisper-1');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });

    const whisperText = await whisperRes.text();
    if(!whisperRes.ok) throw new Error('Whisper failed: ' + whisperText.slice(0,300));

    const whisperData = JSON.parse(whisperText);
    return { statusCode:200, body: JSON.stringify({ source:'cobalt+whisper', transcript: whisperData.text }) };

  }catch(err){
    console.log('transcriber-url error', err);
    return { statusCode:500, body: JSON.stringify({error: err.message}) };
  }
};
