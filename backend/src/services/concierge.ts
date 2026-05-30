/**
 * AI Concierge service.
 *
 * 「ユーザーの気分 + 候補レストラン」から推薦リスト (restaurantId + reason)
 * を返す。LLM provider は env var `AI_PROVIDER` で切替:
 *   - `anthropic` (default): Claude Haiku 4.5 ($1/M in, $5/M out)
 *   - `gemini`:              Gemini 2.0 Flash ($0.075/M in, $0.30/M out)
 *
 * 現在は「能動 AI」(= ユーザー操作時のみ) の 2 機能だけ:
 *   - recommendRestaurants(): コンシェルジュ検索 (履歴注入でパーソナライズ)
 *   - (routes/concierge.ts の /recall がこれを記憶検索に利用)
 * 旧「受動 AI」(TODAY'S PICK / 保存 rec / 食タイプ insights) はコスト削減で全廃。
 */
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// MARK: - LLM provider abstraction
//
// Anthropic / Gemini の差を吸収して、上位レイヤは text だけ受け取れるように。
// PROVIDER=gemini && GEMINI_API_KEY あれば Gemini、無ければ Anthropic にフォールバック。

type LLMOpts = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
};

const PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const HAS_GEMINI = !!process.env.GEMINI_API_KEY;
const HAS_ANTHROPIC = !!process.env.ANTHROPIC_API_KEY;

const anthropicClient = HAS_ANTHROPIC
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const geminiClient = HAS_GEMINI
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  : null;

/**
 * AI provider が一個も設定されてないとアプリを動かす意味がない。
 * route 側で 503 を返すために isLLMAvailable() を export。
 */
export function isLLMAvailable(): boolean {
  return HAS_ANTHROPIC || HAS_GEMINI;
}

/** 実際にどっちで叩くかの最終判断。env と key の有無を見る。 */
function resolveProvider(): 'anthropic' | 'gemini' {
  if (PROVIDER === 'gemini' && HAS_GEMINI) return 'gemini';
  if (PROVIDER === 'anthropic' && HAS_ANTHROPIC) return 'anthropic';
  // フォールバック: 有る方を使う
  if (HAS_ANTHROPIC) return 'anthropic';
  if (HAS_GEMINI) return 'gemini';
  throw new Error('No LLM provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)');
}

async function callLLM({ system, user, maxTokens, temperature }: LLMOpts): Promise<string> {
  const provider = resolveProvider();
  if (provider === 'gemini') {
    // Gemini: systemInstruction で system prompt、generateContent で user 部分。
    const model = geminiClient!.getGenerativeModel({
      // 2.5-flash-lite はコスト 1/4 (input $0.10/M, output $0.40/M)。
      // stoguru の reason 生成・短文 JSON 出力には十分な品質。
      model: 'gemini-2.5-flash-lite',
      systemInstruction: system,
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      },
    });
    const result = await model.generateContent(user);
    return result.response.text();
  }
  // Anthropic (default)
  const resp = await anthropicClient!.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    system,
    messages: [{ role: 'user', content: user }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

export interface ConciergeCandidate {
  id: string;
  name: string;
  genre?: string;
  scene?: string[];
  priceRange?: string;
  distance?: string;
  description?: string;
}

/** ユーザーの嗜好を表す履歴 1 件 (= 保存 or 訪問した店の要約) */
export interface UserHistoryEntry {
  name: string;
  genre?: string;
  scene?: string[];
  priceRange?: string;
  liked?: boolean;          // 訪問して高評価 (★4-5) なら true
}

export interface ConciergeRequest {
  query: string;            // 自由入力 (空でも可)
  chips: string[];          // 選択チップ (気分 / 食べたい / 時間帯 / シーン)
  candidates: ConciergeCandidate[]; // 候補レストラン (最大 30 件くらい想定)
  maxResults?: number;      // 返す件数 (default 6)
  userHistory?: UserHistoryEntry[]; // ユーザーの保存/訪問履歴 (= パーソナライズ用)
}

export interface ConciergeRecommendation {
  restaurantId: string;
  reason: string;           // なぜこの店を選んだか (日本語 1-2 文)
}

export interface ConciergeResponse {
  recommendations: ConciergeRecommendation[];
  /** 全体的なコメント (AI の総括、任意) */
  intro?: string;
}

/**
 * ユーザーの気分・嗜好に合うレストランを Claude に推薦させる。
 * AI が JSON 形式で返すよう指示し、parse する。
 */
export async function recommendRestaurants(
  req: ConciergeRequest
): Promise<ConciergeResponse> {
  if (!isLLMAvailable()) {
    throw new Error('No LLM provider configured');
  }
  if (req.candidates.length === 0) {
    return { recommendations: [] };
  }

  const maxResults = req.maxResults ?? 6;
  const chipText = req.chips.length > 0 ? `選択タグ: ${req.chips.join(', ')}` : '選択タグ: なし';
  const queryText = req.query.trim().length > 0 ? `自由入力: 「${req.query.trim()}」` : '自由入力: なし';
  const historyText = summarizeHistory(req.userHistory);

  // 候補を読みやすい行で詰める。description は 200 字まで使う (店の個性が大事)
  const candidatesList = req.candidates.map((c, i) => {
    const lines: string[] = [`[${i + 1}] id=${c.id}  ${c.name}`];
    const meta: string[] = [];
    if (c.genre) meta.push(c.genre);
    if (c.priceRange) meta.push(c.priceRange);
    if (c.distance) meta.push(c.distance);
    if (c.scene && c.scene.length > 0) meta.push(`シーン: ${c.scene.join(', ')}`);
    if (meta.length > 0) lines.push(`    ${meta.join(' / ')}`);
    if (c.description) lines.push(`    紹介: ${c.description.slice(0, 200)}`);
    return lines.join('\n');
  }).join('\n\n');

  const systemPrompt = `あなたは「ストグル」のレストラン・コンシェルジュ。食通の友人として、ユーザーの気分にぴったり寄り添う 1 軒を見つけるのが仕事。

# 推薦の流儀
- **その店ならでは** の点に着目する。「美味しい」「人気店」「コスパ良い」みたいな誰でも言えるテンプレは禁止。
- 紹介文に書かれた具体的な要素（料理名、立地、雰囲気、シーン、価格帯）から、ユーザーの状況に**結びつく一点**を抽出する。
- 「失恋」「ご褒美」「深夜」みたいな気分タグは、店の雰囲気・席種・価格帯と紐付けて読み解く。

# 出力フォーマット
最初に <thinking> ... </thinking> で 2-4 行考えてから、その後に JSON を出力。
JSON 以外の文字は thinking 以外には書かない。コードブロックも禁止。

{
  "intro": "ユーザーへの一言コメント (50-80字、敬語、感情に寄り添う)",
  "recommendations": [
    { "restaurantId": "<候補の id をそのまま>", "reason": "その店を選んだ具体的理由 (60-100字、敬語、ならでは要素を必ず含める)" }
  ]
}

# reason の良い例
- "京橋という街の温度感とカウンター 4 席という距離感が、人と話したくない夜の沈黙に向いています。"
- "あっさり醤油の沁み方が定評で、深夜まで開いている希少なラーメン店です。お一人様カウンター席が落ち着きます。"

# reason の悪い例（こうは書かないこと）
- "美味しいお店です。"     ← 一般論
- "人気店なのでおすすめ。" ← 中身ゼロ
- "あなたにぴったりです。" ← 根拠なし`;

  const userPrompt = `# ユーザーの状況
${chipText}
${queryText}
${historyText}

# 候補 (${req.candidates.length} 軒)
${candidatesList}

候補の中から最大 ${maxResults} 軒を選び、上の流儀に従って推薦してください。${req.userHistory && req.userHistory.length > 0 ? "ユーザーの好み傾向も考慮しつつ、今の状況を最優先で。" : ""}`;

  const text = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 1500,
    temperature: 1.0,
  });

  const parsed = safeParseJSON(text);
  if (!parsed) {
    console.error('[concierge] Failed to parse AI response:', text);
    return { recommendations: [], intro: 'うまく整理できませんでした…' };
  }

  // バリデーション + 候補に無い id を除外
  const validIds = new Set(req.candidates.map((c) => c.id));
  const recs: ConciergeRecommendation[] = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .filter((r: unknown): r is { restaurantId: string; reason: string } => {
          if (typeof r !== 'object' || r === null) return false;
          const obj = r as Record<string, unknown>;
          return typeof obj.restaurantId === 'string'
              && typeof obj.reason === 'string'
              && validIds.has(obj.restaurantId);
        })
        .slice(0, maxResults)
    : [];

  return {
    recommendations: recs,
    intro: typeof parsed.intro === 'string' ? parsed.intro : undefined,
  };
}

/** ユーザー履歴を AI 用の短いサマリ文字列にする (= トークン節約しつつ嗜好を伝える)。
 *  頻出ジャンル / シーン + 高評価店を集計。履歴なしなら空文字。 */
function summarizeHistory(history?: UserHistoryEntry[]): string {
  if (!history || history.length === 0) return '';

  const tally = (arr: (string | undefined)[]) => {
    const m = new Map<string, number>();
    for (const x of arr) {
      if (!x) continue;
      m.set(x, (m.get(x) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };

  const genres = tally(history.map((h) => h.genre)).slice(0, 3);
  const scenes = tally(history.flatMap((h) => h.scene ?? [])).slice(0, 3);
  const liked = history.filter((h) => h.liked).map((h) => h.name).slice(0, 5);

  const parts: string[] = [];
  if (genres.length) parts.push(`よく選ぶジャンル: ${genres.join(' / ')}`);
  if (scenes.length) parts.push(`よく行くシーン: ${scenes.join(' / ')}`);
  if (liked.length) parts.push(`過去に高評価: ${liked.join(' / ')}`);
  if (parts.length === 0) return '';
  return `\n# このユーザーの好み傾向 (参考)\n${parts.join('\n')}`;
}

/** JSON.parse の safe wrapper。<thinking> や ```json``` を剥がして
 *  最初の { から最後の } までを抽出してパースする。 */
function safeParseJSON(s: string): Record<string, unknown> | null {
  // <thinking>...</thinking> を全部除去
  let cleaned = s.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
  // ```json ... ``` を剥がす
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  // それでも前後にゴミがあった時に備えて最初の { 〜 最後の } を取る
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  try {
    const v = JSON.parse(cleaned);
    return typeof v === 'object' && v !== null ? v : null;
  } catch {
    return null;
  }
}

