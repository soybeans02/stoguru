/**
 * AI Concierge service.
 *
 * Claude 3 Haiku を使って「ユーザーの気分 + 候補レストラン」から
 * 推薦リスト (restaurantId + reason) を返す。
 *
 * - キー: process.env.ANTHROPIC_API_KEY
 * - モデル: claude-3-haiku-20240307 (最安、$0.25/M in, $1.25/M out)
 * - 入力: 自由テキスト query + chip[] + 候補 restaurants[]
 * - 出力: { recommendations: [{ restaurantId, reason }] }
 *
 * TODAY'S PICK と insights は 24h キャッシュ (in-memory)。
 * Concierge 検索はリアルタイム (キャッシュなし)。
 */
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// MARK: - 24h in-memory cache (TODAY'S PICK / insights 用)
//
// 単一サーバープロセス内のみ。マルチインスタンス展開時は Dynamo に移す。
// キーは候補/履歴の hash + 日付 → 内容変わったら別キー = 自動失効。

interface CacheEntry<T> { value: T; expires: number }
const dailyCache = new Map<string, CacheEntry<unknown>>();
const DAY_MS = 24 * 60 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const e = dailyCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    dailyCache.delete(key);
    return null;
  }
  return e.value as T;
}
function setCached<T>(key: string, value: T, ttlMs = DAY_MS): void {
  dailyCache.set(key, { value, expires: Date.now() + ttlMs });
  // 簡易 LRU: 1000 件超えたら古いの 100 件捨てる
  if (dailyCache.size > 1000) {
    const oldest = Array.from(dailyCache.keys()).slice(0, 100);
    oldest.forEach((k) => dailyCache.delete(k));
  }
}
/**
 * 同じ候補 + 同じ日付なら同じキー → キャッシュヒット。
 * 候補が変わる (例: 新着フィード入れ替え) と自動的に新キー = 再計算。
 */
function makeDailyKey(prefix: string, items: string[]): string {
  const joined = items.slice().sort().join(',');
  const hash = crypto.createHash('md5').update(joined).digest('hex').slice(0, 12);
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `${prefix}:${hash}:${date}`;
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

export interface ConciergeRequest {
  query: string;            // 自由入力 (空でも可)
  chips: string[];          // 選択チップ (気分 / 食べたい / 時間帯 / シーン)
  candidates: ConciergeCandidate[]; // 候補レストラン (最大 30 件くらい想定)
  maxResults?: number;      // 返す件数 (default 6)
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
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  if (req.candidates.length === 0) {
    return { recommendations: [] };
  }

  const maxResults = req.maxResults ?? 6;
  const chipText = req.chips.length > 0 ? `選択タグ: ${req.chips.join(', ')}` : '選択タグ: なし';
  const queryText = req.query.trim().length > 0 ? `自由入力: 「${req.query.trim()}」` : '自由入力: なし';

  // 候補を JSON Lines 風に詰める (トークン節約)
  const candidatesList = req.candidates.map((c) => {
    const parts = [
      `id=${c.id}`,
      `name=${c.name}`,
      c.genre ? `genre=${c.genre}` : null,
      c.priceRange ? `price=${c.priceRange}` : null,
      c.distance ? `dist=${c.distance}` : null,
      c.scene && c.scene.length > 0 ? `scene=${c.scene.join('|')}` : null,
      c.description ? `desc=${c.description.slice(0, 80)}` : null,
    ].filter(Boolean);
    return `- ${parts.join(' / ')}`;
  }).join('\n');

  const systemPrompt = `あなたは「ストグル」というレストラン発見アプリの AI コンシェルジュです。
ユーザーの気分・タグ・自由入力を読み取り、候補レストラン一覧の中から最大 ${maxResults} 件を選んで推薦します。

出力ルール:
- 出力は必ず以下の JSON フォーマット (それ以外は一切書かない、コードブロックも禁止):
{
  "intro": "全体への一言コメント (40字以内、敬語)",
  "recommendations": [
    { "restaurantId": "<候補にあった id>", "reason": "なぜこの店か (40字以内、敬語)" }
  ]
}
- restaurantId は必ず候補リスト中の id をそのままコピーする (捏造禁止)。
- 該当が無さそうなら recommendations を空配列にして intro でその旨を伝える。
- reason はその店ならではの理由を簡潔に。一般論は避ける。`;

  const userPrompt = `${chipText}
${queryText}

候補レストラン (${req.candidates.length} 件):
${candidatesList}

上記から最大 ${maxResults} 件を選んで JSON で返してください。`;

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // text content を取り出して JSON parse
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

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

/** JSON.parse の safe wrapper (前後の改行・空白を吸収) */
function safeParseJSON(s: string): Record<string, unknown> | null {
  const trimmed = s.trim();
  // たまにモデルが ```json ... ``` で囲ってくる対策
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const v = JSON.parse(stripped);
    return typeof v === 'object' && v !== null ? v : null;
  } catch {
    return null;
  }
}

// MARK: - キャッシュ付きラッパー (TODAY'S PICK / Saved 推薦)

/**
 * TODAY'S PICK: 候補から 1 軒選ぶ。同じ候補セット + 同じ日付なら cache。
 */
export async function pickTodayCached(
  candidates: ConciergeCandidate[]
): Promise<ConciergeResponse> {
  if (candidates.length === 0) return { recommendations: [] };
  const key = makeDailyKey('today-pick', candidates.map((c) => c.id));
  const hit = getCached<ConciergeResponse>(key);
  if (hit) return hit;

  const result = await recommendRestaurants({
    query: '今日のおすすめを 1 軒選んで',
    chips: [],
    candidates,
    maxResults: 1,
  });
  setCached(key, result);
  return result;
}

/**
 * 保存タブ AI 推薦: 未訪問候補から 3 軒。候補+日付で cache。
 */
export async function recommendSavedCached(
  candidates: ConciergeCandidate[]
): Promise<ConciergeResponse> {
  if (candidates.length === 0) return { recommendations: [] };
  const key = makeDailyKey('saved-rec', candidates.map((c) => c.id));
  const hit = getCached<ConciergeResponse>(key);
  if (hit) return hit;

  const result = await recommendRestaurants({
    query: '保存済みの未訪問から、次に行くべき店を 3 軒',
    chips: ['未訪問', 'おすすめ'],
    candidates,
    maxResults: 3,
  });
  setCached(key, result);
  return result;
}

// MARK: - User Insights (You タブの AI 傾向)

export interface InsightStockEntry {
  name: string;
  genre?: string;
  scene?: string[];
  priceRange?: string;
  visited: boolean;
}

export interface InsightsRequest {
  stocks: InsightStockEntry[];
}

export interface UserInsight {
  emoji: string;
  label: string;     // 「昼は あっさり系」「夜は 立ち飲み」 等の短文
  level: number;     // 1..5 (傾向の強さ)
}

export interface InsightsResponse {
  insights: UserInsight[];
  intro?: string;    // 全体傾向の一言コメント
}

/**
 * ユーザーの保存履歴から食の傾向を AI に言語化させる。
 * 出力は 4-6 個の insight (emoji + ラベル + 強さ)。
 */
export async function analyzeUserInsights(
  req: InsightsRequest
): Promise<InsightsResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  if (req.stocks.length === 0) {
    return { insights: [], intro: 'まだ保存履歴がありません' };
  }

  // 24h cache (stocks セット + 日付ベース)
  const cacheKey = makeDailyKey(
    'insights',
    req.stocks.map((s) => `${s.name}:${s.visited ? 1 : 0}`)
  );
  const hit = getCached<InsightsResponse>(cacheKey);
  if (hit) return hit;

  // 保存履歴を簡潔に文字列化
  const stocksList = req.stocks.slice(0, 60).map((s) => {
    const parts = [
      s.name,
      s.genre ? `(${s.genre})` : '',
      s.priceRange ? `[${s.priceRange}]` : '',
      s.scene && s.scene.length > 0 ? `<${s.scene.join('|')}>` : '',
      s.visited ? '✓' : '',
    ].filter(Boolean);
    return `- ${parts.join(' ')}`;
  }).join('\n');

  const systemPrompt = `あなたはユーザーの食の嗜好を分析するアナリストです。
保存履歴からその人の傾向を 4-6 個の insight に言語化してください。
各 insight は短いラベル (16字以内、敬語不要) + 強さ (1-5) + 食べ物 emoji 1 個。

出力ルール:
- 必ず以下の JSON のみ (コードブロック禁止、それ以外の文字も禁止):
{
  "intro": "全体傾向の一言コメント (40字以内、敬語不要)",
  "insights": [
    { "emoji": "🍜", "label": "昼は あっさり系", "level": 4 }
  ]
}
- emoji は具体的な食べ物 (🍜🍶🍣🍢🥩☕🍝🥟🍱🍷 等)。ジャンルに合うものを 1 個。
- label は具体的に。「ラーメンが多い」みたいに固有名でも OK。
- level は保存履歴全体に対する偏りの強さ (5 = 圧倒的, 1 = 軽め)。
- intro はユーザーへの呼びかけや励ましを含めて。`;

  const userPrompt = `保存履歴 (${req.stocks.length} 軒):
${stocksList}

上記から食の傾向を分析して JSON で返してください。`;

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = safeParseJSON(text);
  if (!parsed) {
    console.error('[insights] Failed to parse:', text);
    return { insights: [], intro: '分析できませんでした' };
  }

  const insights: UserInsight[] = Array.isArray(parsed.insights)
    ? parsed.insights
        .filter((i: unknown): i is { emoji: string; label: string; level: number } => {
          if (typeof i !== 'object' || i === null) return false;
          const o = i as Record<string, unknown>;
          return typeof o.emoji === 'string'
              && typeof o.label === 'string'
              && typeof o.level === 'number';
        })
        .map((i) => ({
          emoji: i.emoji,
          label: String(i.label).slice(0, 30),
          level: Math.max(1, Math.min(5, Math.round(i.level))),
        }))
        .slice(0, 6)
    : [];

  const out: InsightsResponse = {
    insights,
    intro: typeof parsed.intro === 'string' ? parsed.intro : undefined,
  };
  setCached(cacheKey, out);
  return out;
}
