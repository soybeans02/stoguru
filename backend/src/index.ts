// 他の import より前に env を読み込む。
// routes/admin.ts などは module load 時に process.env.* を参照するので、
// ここで dotenv を「side-effect import」で先に走らせないと
// ADMIN_SECRET 等が undefined のまま落ちる。
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth';
import dataRouter from './routes/data';
import uploadRouter from './routes/upload';
import adminRouter from './routes/admin';
import featuresRouter from './routes/features';
import influencerRouter from './routes/influencer';
import feedbackRouter from './routes/feedback';
import publicRouter from './routes/public';
import { saveStats, loadStats, saveActivity, loadActivity } from './services/dynamo';
import { stats, userActivity } from './state';
import { peekVerifiedUserId } from './middleware/auth';
// rate limiter uses `any` for keyGenerator to avoid Express type conflicts

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── レート制限 ───

// ユーザー単位のキー生成（認証済みならuserId、未認証ならIP）。
// rate-limit ミドルウェアは requireAuth より前に走るため req.user はまだ
// 未設定。代わりに peekVerifiedUserId() で「検証済みでキャッシュにある」
// userId のみ信頼し、初回や匿名は IP fallback にする（攻撃者が任意 userId
// を Bearer ヘッダーに詰めて per-user limit をバイパスできないように）。
const userKeyGenerator = (req: any): string => {
  const verified = peekVerifiedUserId(req);
  if (verified) return verified;
  // IPv6プレフィックスを正規化（/64単位でグルーピング）
  const ip = req.ip ?? 'unknown';
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 4);
    return parts.join(':') + '::/64';
  }
  return ip;
};

// 全API共通: 1分間に120リクエストまで（連打・無限ループ防止）
const rateLimitBase = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  keyGenerator: userKeyGenerator,
  validate: { default: true, keyGeneratorIpFallback: false } satisfies Record<string, boolean>,
};

const globalLimit = rateLimit({
  ...rateLimitBase,
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'リクエストが多すぎます。少し待ってから試してください。' },
});

// 全API共通: 1時間に3000リクエストまで（バグによる暴走防止）
const hourlyLimit = rateLimit({
  ...rateLimitBase,
  windowMs: 60 * 60 * 1000,
  max: 3000,
  message: { error: '1時間のリクエスト上限に達しました。しばらく待ってください。' },
});

// 書き込み系API: 1分間に20リクエストまで（DynamoDB書き込みコスト抑制）
const writeLimit = rateLimit({
  ...rateLimitBase,
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '書き込みリクエストが多すぎます。少し待ってください。' },
});

// 認証系: 1分間に10リクエストまで（ブルートフォース防止）
const authLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '認証リクエストが多すぎます。少し待ってください。' },
});


const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(null, false);
  },
  credentials: true,
  maxAge: 600,
}));
app.use(helmet({
  contentSecurityPolicy: false, // API server, not serving HTML
  strictTransportSecurity: { maxAge: 63072000 },
  frameguard: { action: 'deny' },
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ─── CSRF対策: state-changing requestsにContent-Type: application/jsonを要求 ───
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] ?? '';
    if (!ct.includes('application/json')) {
      res.status(415).json({ error: 'Content-Type: application/json が必要です' });
      return;
    }
  }
  next();
});

// stats と userActivity は ./state.ts から import

// stats.byEndpoint / byHour / userActivity の memory 制限。req.path は :id を
// 展開した値が来るので（/follow/abc-123-... 等）、放置すると unique パスごとに
// キーが増えて memory leak になる。
const STATS_ENDPOINT_MAX = 500;
const STATS_HOUR_MAX = 24 * 7; // 1 週間分
const USER_ACTIVITY_MAX = 5000;

function normalizeStatsPath(method: string, path: string): string {
  // 動的セグメント（UUID / 数字）を `:id` にまとめてキーの爆発を防ぐ
  const cleaned = path
    .replace(/\/[a-f0-9]{8}-[a-f0-9-]+/gi, '/:id')
    .replace(/\/\d+/g, '/:n');
  return `${method} ${cleaned}`;
}

function trimMap<T extends Record<string, unknown>>(map: T, max: number): void {
  const keys = Object.keys(map);
  if (keys.length <= max) return;
  // 古いキーから 10% 削る
  const drop = Math.ceil(max * 0.1);
  for (let i = 0; i < drop; i++) delete map[keys[i]];
}

app.use('/api', (req, _res, next) => {
  stats.total++;
  const key = normalizeStatsPath(req.method, req.path);
  stats.byEndpoint[key] = (stats.byEndpoint[key] ?? 0) + 1;
  if (Object.keys(stats.byEndpoint).length > STATS_ENDPOINT_MAX) trimMap(stats.byEndpoint, STATS_ENDPOINT_MAX);
  const hour = new Date().toISOString().slice(0, 13);
  stats.byHour[hour] = (stats.byHour[hour] ?? 0) + 1;
  if (Object.keys(stats.byHour).length > STATS_HOUR_MAX) trimMap(stats.byHour, STATS_HOUR_MAX);
  // ユーザーアクティビティ追跡（Authorizationヘッダーからユーザー特定）
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // トークンデコード後にrequireAuthでreq.userがセットされるので、レスポンス後に記録
    _res.on('finish', () => {
      const u = (req as any).user;
      if (u?.userId) {
        userActivity[u.userId] = { lastSeen: Date.now(), nickname: u.nickname ?? userActivity[u.userId]?.nickname };
        if (Object.keys(userActivity).length > USER_ACTIVITY_MAX) trimMap(userActivity, USER_ACTIVITY_MAX);
      }
    });
  }
  next();
});

// 全APIにグローバル制限
app.use('/api', globalLimit, hourlyLimit);

// 認証系に追加制限
app.use('/api/auth', authLimit);
app.use('/api/auth', authRouter);

// 書き込み系エンドポイントに追加制限（PUT/POST/DELETE）
app.use('/api', (req, _res, next) => {
  if (req.method === 'GET') return next();
  writeLimit(req, _res, next);
});
app.use('/api', dataRouter);
app.use('/api', uploadRouter);
app.use('/api/influencer', influencerRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/public', publicRouter);
app.use('/api/admin', authLimit);
app.use('/api/admin', adminRouter);
app.use('/api', featuresRouter); // /features (匿名アクセス可)

// ─── ヘルスチェック ───
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── グローバルエラーハンドラ ───
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

// 起動時にDBから統計を復元
loadStats().then((saved) => {
  if (saved) {
    stats.total = (saved.total as number) ?? 0;
    stats.byEndpoint = (saved.byEndpoint as Record<string, number>) ?? {};
    stats.byHour = (saved.byHour as Record<string, number>) ?? {};
    console.log(`Stats restored: ${stats.total} total requests`);
  }
}).catch(() => {});

// 起動時にDBからアクティビティを復元
loadActivity().then((saved) => {
  if (saved) {
    Object.assign(userActivity, saved);
    console.log(`Activity restored: ${Object.keys(saved).length} users`);
  }
}).catch(() => {});

// 5分ごとにDBに統計+アクティビティを保存
setInterval(() => {
  saveStats({
    total: stats.total,
    byEndpoint: stats.byEndpoint,
    byHour: stats.byHour,
    startedAt: stats.startedAt,
  }).catch((err) => console.warn('Stats save failed:', err));
  saveActivity(userActivity).catch((err) => console.warn('Activity save failed:', err));
}, 5 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

// ─── グレースフルシャットダウン ───
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Gracefully shutting down...`);

  // 統計+アクティビティを保存
  try {
    await Promise.all([
      saveStats({ total: stats.total, byEndpoint: stats.byEndpoint, byHour: stats.byHour, startedAt: stats.startedAt }),
      saveActivity(userActivity),
    ]);
    console.log('Stats and activity saved.');
  } catch (err) {
    console.warn('Failed to save on shutdown:', err);
  }

  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  // 10秒以内に閉じなければ強制終了
  setTimeout(() => {
    console.warn('Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
