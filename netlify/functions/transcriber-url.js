// Uses captions first, then tells user to upload if blocked. No yt-dlp in Netlify.
exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    const { url } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: "No URL" }) };
    // For V1: return clear message - user should use Captions or Upload.
    // Full yt-dlp download needs a separate server, not Netlify.
    return { statusCode: 400, headers, body: JSON.stringify({ error: "URL download not available on Netlify free. Use Captions First or Upload file. For YouTube, paste link and use Captions method." }) };
  } catch(e){ return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
};
