const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_SITE = process.env.OPENROUTER_SITE || 'http://localhost';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || 'BE_NVIDIA';

if (!OPENROUTER_API_KEY) {
  console.warn(
    '[OpenRouter] Missing OPENROUTER_API_KEY env; AI features will fail.',
  );
}

export async function grokChat(messages, model = 'x-ai/grok-4-fast:free') {
  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': OPENROUTER_SITE,
      'X-Title': OPENROUTER_TITLE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[OpenRouter] HTTP ${res.status}: ${err}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content;
}
