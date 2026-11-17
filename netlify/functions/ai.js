exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ reply: "GROQ_API_KEY not set" }) };
  let body = {}; try { body = JSON.parse(event.body || "{}"); } catch(e){}
  const prompt = body.prompt || body.message || "Summarize this";
  const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3-32b"];
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: "You are Wave Buddy, Wavelord Transcriber AI. Summarize clearly, give key points." }, { role: "user", content: prompt }], temperature: 0.7, max_tokens: 800 }) });
      const data = await res.json();
      if (res.ok && data.choices?.[0]?.message?.content) { const reply = data.choices[0].message.content; return { statusCode: 200, headers, body: JSON.stringify({ reply, text: reply, answer: reply, model }) }; }
    } catch(e){}
  }
  return { statusCode: 500, headers, body: JSON.stringify({ reply: "AI failed" }) };
};
