// ─── 共有アプリケーションステート ───
// index.ts と admin.ts の循環依存を解消するための分離モジュール

export const stats = {
  total: 0,
  byEndpoint: {} as Record<string, number>,
  byHour: {} as Record<string, number>,
  startedAt: new Date().toISOString(),
};

export const userActivity: Record<string, { lastSeen: number; nickname?: string }> = {};
