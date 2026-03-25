import Anthropic from '@anthropic-ai/sdk';

export interface ExtractedRestaurant {
  restaurantName: string | null;
  address: string | null;
}

export async function extractRestaurantFromText(text: string): Promise<ExtractedRestaurant> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `以下の動画タイトル・説明文から、紹介されているレストランの店名と住所（日本語）を抽出してください。
見つからない場合はnullを返してください。

テキスト:
${text}

以下のJSON形式のみで返答してください（説明文不要）:
{"restaurantName": "店名 or null", "address": "住所 or null"}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') return { restaurantName: null, address: null };

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { restaurantName: null, address: null };
    const parsed = JSON.parse(jsonMatch[0]) as { restaurantName?: string | null; address?: string | null };
    return {
      restaurantName: parsed.restaurantName ?? null,
      address: parsed.address ?? null,
    };
  } catch (err) {
    console.warn('[claude] JSON parse failed:', content.text.slice(0, 200));
    return { restaurantName: null, address: null };
  }
}
