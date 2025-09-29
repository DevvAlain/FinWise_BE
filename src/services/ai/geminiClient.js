// Lightweight Gemini client using fetch
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models';

if (!GEMINI_API_KEY) {
  console.warn('[Gemini] Missing GEMINI_API_KEY env; AI features will fail.');
}

const buildUrl = (model) =>
  `${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

export async function geminiGenerateJSON(systemPrompt, userText) {
  const url = buildUrl(GEMINI_MODEL);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\nUser input:\n${userText}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[Gemini] HTTP ${res.status}: ${errText}`);
  }
  const data = await res.json();
  // Parse candidates
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '{}';
  const safetyRatings = candidate?.safetyRatings;
  const parsed = JSON.parse(text);
  // Attach naive confidence if model returns it; else default
  if (typeof parsed.confidence !== 'number') {
    parsed.confidence = 0.8;
  }
  return parsed;
}
