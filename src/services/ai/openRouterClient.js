const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'x-ai/grok-4-fast:free';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_SITE = process.env.OPENROUTER_SITE || 'http://localhost';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || 'BE_NVIDIA';

if (!OPENROUTER_API_KEY) {
  console.warn(
    '[OpenRouter] Missing OPENROUTER_API_KEY env; AI features will fail.',
  );
}

// Generic chat function
export async function openRouterChat(messages, model = OPENROUTER_MODEL) {
  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': OPENROUTER_SITE,
        'X-Title': OPENROUTER_TITLE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1, // Low temperature for consistent category classification
        max_tokens: 100
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[OpenRouter] HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  } catch (error) {
    console.error('[OpenRouter] Chat error:', error);
    throw error;
  }
}

// Specific function for category classification
export async function classifyExpenseCategory(transactionDescription) {
  const categories = [
    'Ăn uống', 'Mua sắm', 'Di chuyển', 'Giải trí',
    'Y tế', 'Giáo dục', 'Nhà cửa', 'Thu nhập', 'Khác'
  ];

  const messages = [
    {
      role: 'system',
      content: `Bạn là AI chuyên phân loại chi tiêu. Hãy phân loại giao dịch vào 1 trong ${categories.length} danh mục sau: ${categories.join(', ')}.
      
Chỉ trả về tên danh mục và độ tin cậy (0-1), format: "Danh_mục|0.85"

Ví dụ:
- "Mua cà phê" → "Ăn uống|0.9"
- "Đổ xăng" → "Di chuyển|0.95"
- "Mua sách" → "Giáo dục|0.8"`
    },
    {
      role: 'user',
      content: `Phân loại giao dịch này: "${transactionDescription}"`
    }
  ];

  try {
    const response = await openRouterChat(messages);

    // Parse response: "Category|0.85"
    const parts = response.trim().split('|');
    if (parts.length === 2) {
      const category = parts[0].trim();
      const confidence = parseFloat(parts[1]);

      if (categories.includes(category) && confidence >= 0 && confidence <= 1) {
        return { category, confidence };
      }
    }

    // Fallback if parsing fails
    return { category: null, confidence: 0 };

  } catch (error) {
    console.error('[OpenRouter] Category classification error:', error);
    return { category: null, confidence: 0 };
  }
}

// Legacy function for backward compatibility
export const grokChat = openRouterChat;
