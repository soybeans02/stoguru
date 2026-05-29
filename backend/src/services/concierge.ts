/**
 * AI Concierge service.
 *
 * 「ユーザーの気分 + 候補レストラン」から推薦リスト (restaurantId + reason)
 * を返す。LLM provider は env var `AI_PROVIDER` で切替:
 *   - `anthropic` (default): Claude Haiku 4.5 ($1/M in, $5/M out)
 *   - `gemini`:              Gemini 2.0 Flash ($0.075/M in, $0.30/M out)
 *
 * TODAY'S PICK と insights は 24h キャッシュ (in-memory)。
 * Concierge 検索はリアルタイム (キャッシュなし)。
 */
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

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
  return `${prefix}:${hash}:${jstDateString()}`;
}

/** JST (Asia/Tokyo) の "YYYY-MM-DD"。Render は UTC なので +9h して算出。
 *  これがないと「日付」が UTC 0:00 (= JST 9:00) で切り替わり、朝の利用者が
 *  前日の pick を見る等のズレが起きる。 */
function jstDateString(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** JST の時 (0-23)。pickTodayCached の朝/昼/夜 文脈判定に使う。
 *  getHours() は server TZ (= UTC) を返すため JST と 9h ズレるのを補正。 */
function jstHour(): number {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
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

  // 時刻に応じた文脈を AI に渡す
  const hour = jstHour();
  const timeContext: string =
    hour < 6  ? '深夜帯、まだ食事を探している人向け' :
    hour < 11 ? '朝の時間帯、ゆっくり始めたい人向け' :
    hour < 14 ? '昼食の時間帯' :
    hour < 17 ? '午後の中休み、カフェやおやつの時間' :
    hour < 21 ? '夕食の時間帯' :
                '夜遅く、晩酌や〆を求める時間帯';

  const result = await recommendRestaurants({
    query: `今は ${timeContext}。この時間に行くなら、と一押しを 1 軒。妥当性より「この時間にこの店」という納得感を重視。`,
    chips: [],
    candidates,
    maxResults: 1,
  });
  setCached(key, result);
  return result;
}

export type DaySlot = 'morning' | 'lunch' | 'dinner';

/**
 * 朝/昼/夜 のスロット別 PICK。各 slot ごとにキャッシュ。
 */
export async function pickBySlotCached(
  slot: DaySlot,
  candidates: ConciergeCandidate[]
): Promise<ConciergeResponse> {
  if (candidates.length === 0) return { recommendations: [] };
  const key = makeDailyKey(`pick-${slot}`, candidates.map((c) => c.id));
  const hit = getCached<ConciergeResponse>(key);
  if (hit) return hit;

  const slotContext: Record<DaySlot, string> = {
    morning: '朝の時間帯。モーニング・喫茶・朝食向き。あっさり / 軽め / コーヒー / 卵料理 など朝の気分。',
    lunch:   '昼の時間帯。ランチ・定食・がっつり / さっぱり 昼飯向き。混雑時の回転や手早さも意識。',
    dinner:  '夜の時間帯。ディナー・居酒屋・お酒に合う料理・ゆっくり過ごす席。',
  };
  const result = await recommendRestaurants({
    query: `${slotContext[slot]} この時間帯にぴったりの 1 軒を、納得感重視で選んでください。`,
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
    query: 'これらはユーザーが「気になって保存」してまだ行けてない店たち。背中を押す感じで、次に足を運ぶべき 3 軒を選んでください。「保存したからには行ってほしい」という温度感で。',
    chips: ['未訪問'],
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
  if (!isLLMAvailable()) {
    throw new Error('No LLM provider configured');
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

  const text = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 800,
  });

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
