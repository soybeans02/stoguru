import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import extractRouter from './routes/extract';
import authRouter from './routes/auth';
import dataRouter from './routes/data';
import adminRouter from './routes/admin';
import { saveStats, loadStats } from './services/dynamo';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── レート制限 ───

// 全API共通: 1分間に120リクエストまで（連打・無限ループ防止）
const globalLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエストが多すぎます。少し待ってから試してください。' },
});

// 全API共通: 1時間に3000リクエストまで（バグによる暴走防止）
const hourlyLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '1時間のリクエスト上限に達しました。しばらく待ってください。' },
});

// 書き込み系API: 1分間に20リクエストまで（DynamoDB書き込みコスト抑制）
const writeLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
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

// AI抽出: 1分10回 + 1日100回（Anthropic API課金防止）
const extractPerMinute = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'リクエストが多すぎます。少し待ってから試してください。' },
});
const extractDaily = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  message: { error: '1日の利用上限(100回)に達しました。明日また試してください。' },
});

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ─── リクエスト統計 ───
export const stats = {
  total: 0,
  byEndpoint: {} as Record<string, number>,
  byHour: {} as Record<string, number>,
  startedAt: new Date().toISOString(),
};

// ─── ユーザーアクティビティ ───
export const userActivity: Record<string, { lastSeen: number; nickname?: string }> = {};

app.use('/api', (req, _res, next) => {
  stats.total++;
  const key = `${req.method} ${req.path}`;
  stats.byEndpoint[key] = (stats.byEndpoint[key] ?? 0) + 1;
  const hour = new Date().toISOString().slice(0, 13);
  stats.byHour[hour] = (stats.byHour[hour] ?? 0) + 1;
  // ユーザーアクティビティ追跡（Authorizationヘッダーからユーザー特定）
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // トークンデコード後にrequireAuthでreq.userがセットされるので、レスポンス後に記録
    _res.on('finish', () => {
      const u = (req as any).user;
      if (u?.userId) {
        userActivity[u.userId] = { lastSeen: Date.now(), nickname: u.nickname ?? userActivity[u.userId]?.nickname };
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

// AI抽出に追加制限
app.use('/api/extract-url', extractPerMinute, extractDaily);
app.use('/api', extractRouter);

// 書き込み系エンドポイントに追加制限（PUT/POST/DELETE）
app.use('/api', (req, _res, next) => {
  if (req.method === 'GET') return next();
  writeLimit(req, _res, next);
});
app.use('/api', dataRouter);
app.use('/api/admin', adminRouter);

// 起動時にDBから統計を復元
loadStats().then((saved) => {
  if (saved) {
    stats.total = (saved.total as number) ?? 0;
    stats.byEndpoint = (saved.byEndpoint as Record<string, number>) ?? {};
    stats.byHour = (saved.byHour as Record<string, number>) ?? {};
    console.log(`Stats restored: ${stats.total} total requests`);
  }
}).catch(() => {});

// 5分ごとにDBに統計を保存
setInterval(() => {
  saveStats({
    total: stats.total,
    byEndpoint: stats.byEndpoint,
    byHour: stats.byHour,
    startedAt: stats.startedAt,
  }).catch((err) => console.warn('Stats save failed:', err));
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
