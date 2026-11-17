exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    const { url } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: "No URL" }) };
    const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ url, downloadMode: "audio", filenameStyle: "basic" })
    });
    const cobalt = await cobaltRes.json();
    if (!cobalt.url) return { statusCode: 400, headers, body: JSON.stringify({ error: "Cobalt could not get audio. Try Captions or Upload. " + (cobalt.text || "") }) };
    return { statusCode: 200, headers, body: JSON.stringify({ audioUrl: cobalt.url, filename: cobalt.filename || "audio.mp3" }) };
  } catch(e){ return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
};
