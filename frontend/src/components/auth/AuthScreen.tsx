import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

interface AuthScreenProps {
  initialMode?: 'login' | 'signup';
  onClose?: () => void;
  onAuthSuccess?: () => void;
}

export function AuthScreen({ initialMode, onClose, onAuthSuccess }: AuthScreenProps = {}) {
  const { user, signUp, login, forgotPassword, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode ?? 'login');

  // ログイン成功で自動で閉じる（モーダル用途）
  useEffect(() => {
    if (user && onAuthSuccess) {
      onAuthSuccess();
    }
  }, [user, onAuthSuccess]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, nickname);
        await login(email, password);
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        setMode('reset');
      } else if (mode === 'reset') {
        await resetPassword(email, code, newPassword);
        setPassword(newPassword);
        setCode('');
        setNewPassword('');
        setMode('login');
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '失敗しました');
    } finally {
      setLoading(false);
    }
  }

  const modeLabel: Record<Mode, string> = {
    login: 'ログイン',
    signup: 'アカウント作成',
    forgot: 'パスワード再設定',
    reset: '新しいパスワード設定',
  };

  return (
    <div className="min-h-svh flex bg-gray-50 dark:bg-gray-900 relative">
      {/* 閉じるボタン (モーダル用途) */}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      )}
      {/* PC: 左ブランドエリア */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="auth-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0v40" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#auth-grid)"/>
          </svg>
        </div>
        <div className="relative z-10 text-center text-white px-12">
          <img src="/app-icon.png" alt="ストグル" className="w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg" />
          <h2 className="text-4xl font-bold mb-3 tracking-tight">ストグル</h2>
          <p className="text-lg text-white/80">SNSで見つけたお店を、ストックして、行こう。</p>
        </div>
      </div>

      {/* フォームエリア */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Mobile: ロゴ */}
          <h1 className="text-2xl font-bold text-center mb-1 flex flex-col items-center gap-2 md:hidden">
            <img src="/app-icon.png" alt="ストグル" className="w-14 h-14 rounded-xl" />
            <span className="text-gray-900 dark:text-white">ストグル</span>
          </h1>
          {/* PC: テキストタイトル */}
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 dark:text-white text-center mb-1">
            {modeLabel[mode]}
          </h1>
          <p className="text-center text-gray-500 text-sm mb-8 md:hidden">
            {modeLabel[mode]}
          </p>
          <p className="hidden md:block text-center text-gray-400 text-sm mb-8">
            アカウントにログインして始めましょう
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'forgot' ? (
            <>
              <p className="text-sm text-gray-600 text-center">
                登録済みのメールアドレスを入力してください
              </p>
              <Input
                label="メールアドレス"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
                autoFocus
              />
            </>
          ) : mode === 'reset' ? (
            <>
              <p className="text-sm text-gray-600 text-center">
                <span className="font-medium">{email}</span> に確認コードを送信しました
              </p>
              <Input
                label="確認コード"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6桁のコード"
                autoFocus
              />
              <Input
                label="新しいパスワード"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8文字以上"
              />
            </>
          ) : (
            <>
              {mode === 'signup' && (
                <Input
                  label="ニックネーム"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="表示名"
                  autoFocus
                />
              )}
              <Input
                label="メールアドレス"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mail@example.com"
                autoFocus={mode === 'login'}
              />
              <Input
                label="パスワード"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
              />
            </>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button type="submit" variant="primary" disabled={loading} className="w-full">
            {loading ? '...' : mode === 'login' ? 'ログイン' : mode === 'signup' ? '登録' : mode === 'forgot' ? '送信' : '再設定'}
          </Button>
        </form>

        <div className="text-center text-sm text-gray-500 mt-6 space-y-2">
          {mode === 'login' && (
            <>
              <p>
                <button onClick={() => { setMode('forgot'); setError(''); }} className="text-gray-400 hover:text-gray-600">
                  パスワードを忘れた？
                </button>
              </p>
              <p>
                アカウントがない？{' '}
                <button onClick={() => { setMode('signup'); setError(''); }} className="text-orange-500 font-medium">
                  新規登録
                </button>
              </p>
            </>
          )}
          {mode === 'signup' && (
            <p>
              アカウントがある？{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="text-orange-500 font-medium">
                ログイン
              </button>
            </p>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <p>
              <button onClick={() => { setMode('login'); setError(''); setCode(''); setNewPassword(''); }} className="text-orange-500 font-medium">
                ログインに戻る
              </button>
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// Logo re-export for shared use
export function StogulLogo({ size = 32 }: { size?: number }) {
  return (
    <img src="/app-icon.png" alt="ストグル" width={size} height={size} className="rounded-lg" />
  );
}
