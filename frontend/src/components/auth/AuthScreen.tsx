import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

export function AuthScreen() {
  const { signUp, login, forgotPassword, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
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
    <div className="min-h-svh flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1 flex flex-col items-center gap-1">
          <svg width="48" height="48" viewBox="0 0 80 80">
            <defs>
              <linearGradient id="logo-grad-auth" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor:'#FF6B6B'}}/>
                <stop offset="100%" style={{stopColor:'#FF8E53'}}/>
              </linearGradient>
            </defs>
            <path d="M40 4C25.088 4 13 16.088 13 31c0 20.25 27 43 27 43s27-22.75 27-43C67 16.088 54.912 4 40 4z" fill="url(#logo-grad-auth)"/>
            <g transform="translate(40,40) rotate(-22)">
              <line x1="0" y1="-22" x2="0" y2="6" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              <line x1="-3" y1="-22" x2="-3" y2="-14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="3" y1="-22" x2="3" y2="-14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <path d="M-3 -14 Q0 -10 3 -14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </g>
            <g transform="translate(40,40) rotate(22)">
              <line x1="0" y1="-22" x2="0" y2="6" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M0 -22 Q5 -16 0 -10" fill="white" opacity="0.85"/>
            </g>
          </svg>
          ストグル
        </h1>
        <p className="text-center text-gray-500 text-sm mb-8">
          {modeLabel[mode]}
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
                placeholder="8文字以上（英小文字+数字）"
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
                placeholder="8文字以上（英小文字+数字）"
              />
            </>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
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
  );
}
