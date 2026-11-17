// netlify/functions/transcribe.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Use POST' }) };
    }

    const body = JSON.parse(event.body || '{}');
    let audio = body.audio || body.data || body.file || null;
    if (!audio) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No audio' }) };
    }

    if (typeof audio === 'string' && audio.includes(',')) {
      audio = audio.split(',')[1];
    }

    // Clean whitespace / newlines that break base64
    audio = audio.replace(/\s/g, '');

    if (!audio || audio.length < 100) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No audio - too short' }) };
    }

    const buffer = Buffer.from(audio, 'base64');
    console.log('AUDIO BYTES:', buffer.length);

    // --- Manual multipart - fixes NextPart: EOF ---
    const boundary = '----Wavelord' + Date.now().toString(36);
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );
    const footer = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-large-v3\r\n` +
      `--${boundary}--\r\n`
    );
    const multipartBody = Buffer.concat([header, buffer, footer]);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length)
      },
      body: multipartBody
    });

    const data = await res.json();

    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data.error?.message || 'Groq Whisper failed' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ text: data.text }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
