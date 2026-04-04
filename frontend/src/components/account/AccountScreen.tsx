import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';
import type { StockedRestaurant } from '../stock/StockScreen';

interface Props {
  stocks: StockedRestaurant[];
}

type Panel = null | 'password' | 'email' | 'deleteAccount';
type ListPanel = null | 'stocks' | 'visited' | 'following';

export function AccountScreen({ stocks }: Props) {
  const { user, logout, updateNickname, updateEmail } = useAuth();
  const [profileIcon, setProfileIcon] = useState(() => localStorage.getItem('cache:profileIcon') || '🍕');
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [listPanel, setListPanel] = useState<ListPanel>(null);
  const [followingCount, setFollowingCount] = useState(() => Number(localStorage.getItem('cache:followingCount')) || 0);
  const [followingList, setFollowingList] = useState<{ followeeId: string; nickname?: string }[]>([]);

  const stockCount = stocks.length;
  const visitedCount = stocks.filter((s) => s.visited).length;

  useEffect(() => {
    api.fetchSettings().then((s) => {
      if (s.profileIcon) {
        setProfileIcon(s.profileIcon);
        localStorage.setItem('cache:profileIcon', s.profileIcon);
      }
    }).catch(() => {});
    api.getFollowing().then((f) => {
      setFollowingCount(f.length);
      setFollowingList(f);
      localStorage.setItem('cache:followingCount', String(f.length));
    }).catch(() => {});
  }, []);

  async function handleSaveNickname() {
    if (!nicknameInput.trim()) return;
    try {
      setNicknameError('');
      const result = await api.updateNickname(nicknameInput.trim());
      updateNickname(result.nickname);
      setEditingNickname(false);
    } catch (err: unknown) {
      setNicknameError(err instanceof Error ? err.message : 'エラー');
    }
  }

  const ICON_OPTIONS = ['🍕', '🍣', '🍜', '🍔', '☕', '🍰', '🥩', '🍝', '🌮', '🥟', '🍛', '🥗', '🧁', '🍤', '🍱', '🥂'];
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  async function handleSelectIcon(icon: string) {
    setProfileIcon(icon);
    setIconPickerOpen(false);
    localStorage.setItem('cache:profileIcon', icon);
    try {
      await api.putSettings({ profileIcon: icon });
    } catch {}
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-none px-5 py-6 bg-white">
      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <button
          onClick={() => setIconPickerOpen(!iconPickerOpen)}
          className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-4xl mb-3 relative"
        >
          {profileIcon}
          <span className="absolute -bottom-0.5 -right-0.5 bg-gray-900 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">+</span>
        </button>

        {iconPickerOpen && (
          <div className="bg-gray-50 rounded-xl p-3 mb-3 grid grid-cols-8 gap-2">
            {ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                onClick={() => handleSelectIcon(icon)}
                className={`text-xl w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors ${profileIcon === icon ? 'bg-gray-200 ring-2 ring-gray-400' : ''}`}
              >
                {icon}
              </button>
            ))}
          </div>
        )}

        {editingNickname ? (
          <div className="flex flex-col items-center gap-2">
            <input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              className="text-center text-lg font-bold border-b-2 border-gray-900 outline-none bg-transparent w-40 text-gray-900"
              autoFocus
              maxLength={50}
            />
            {nicknameError && <p className="text-red-500 text-xs">{nicknameError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSaveNickname} className="text-xs px-3 py-1 bg-gray-900 text-white rounded-full">保存</button>
              <button onClick={() => setEditingNickname(false)} className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-full">キャンセル</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNicknameInput(user?.nickname ?? ''); setEditingNickname(true); }}
            className="text-lg font-bold text-gray-900 flex items-center gap-1"
          >
            {user?.nickname ?? 'ユーザー'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
          </button>
        )}
        <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-10 mb-8 pb-6 border-b border-gray-100">
        <button onClick={() => setListPanel('stocks')} className="text-center">
          <p className="text-2xl font-bold text-gray-900">{stockCount}</p>
          <p className="text-[10px] text-gray-400">ストック</p>
        </button>
        <button onClick={() => setListPanel('visited')} className="text-center">
          <p className="text-2xl font-bold text-gray-900">{visitedCount}</p>
          <p className="text-[10px] text-gray-400">行った</p>
        </button>
        <button onClick={() => setListPanel('following')} className="text-center">
          <p className="text-2xl font-bold text-gray-900">{followingCount}</p>
          <p className="text-[10px] text-gray-400">フォロー</p>
        </button>
      </div>

      {/* Menu */}
      <div className="space-y-0">
        <MenuItem label="パスワード変更" onClick={() => setPanel('password')} />
        <MenuItem label="メールアドレス変更" onClick={() => setPanel('email')} />
        <MenuItem label="アカウント削除" onClick={() => setPanel('deleteAccount')} danger />
        <MenuItem label="ログアウト" onClick={logout} danger />
      </div>

      {/* Panels */}
      {panel === 'password' && (
        <ChangePasswordPanel onClose={() => setPanel(null)} />
      )}
      {panel === 'email' && (
        <ChangeEmailPanel
          currentEmail={user?.email ?? ''}
          onSuccess={(email) => { updateEmail(email); setPanel(null); }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'deleteAccount' && (
        <DeleteAccountPanel onClose={() => setPanel(null)} onDeleted={logout} />
      )}

      {/* List panels */}
      {listPanel === 'stocks' && (
        <Overlay title="ストック" onClose={() => setListPanel(null)}>
          {stocks.filter(s => !s.visited).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">まだストックがないよ</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {stocks.filter(s => !s.visited).map(s => (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                  <span className="text-xl">{s.photoEmoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{s.genre}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Overlay>
      )}
      {listPanel === 'visited' && (
        <Overlay title="行った" onClose={() => setListPanel(null)}>
          {stocks.filter(s => s.visited).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">まだ行ったお店がないよ</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {stocks.filter(s => s.visited).map(s => (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                  <span className="text-xl">{s.photoEmoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{s.genre}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Overlay>
      )}
      {listPanel === 'following' && (
        <Overlay title="フォロー" onClose={() => setListPanel(null)}>
          {followingList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">まだフォローしてないよ</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {followingList.map(f => (
                <div key={f.followeeId} className="flex items-center gap-3 py-2 border-b border-gray-50">
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">👤</span>
                  <p className="text-sm text-gray-900">{f.nickname ?? f.followeeId}</p>
                </div>
              ))}
            </div>
          )}
        </Overlay>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between py-3.5 border-b border-gray-100 text-left ${danger ? 'text-red-500' : 'text-gray-700'}`}
    >
      <span className="text-sm">{label}</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}

/* ─── パスワード変更パネル ─── */

function ChangePasswordPanel({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません');
      return;
    }
    if (newPassword.length < 8) {
      setError('パスワードは8文字以上にしてください');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay title="パスワード変更" onClose={onClose}>
      {success ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-700 mb-4">パスワードを変更しました</p>
          <button onClick={onClose} className="text-sm px-6 py-2 bg-gray-900 text-white rounded-lg">閉じる</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput label="現在のパスワード" type="password" value={oldPassword} onChange={setOldPassword} />
          <FormInput label="新しいパスワード" type="password" value={newPassword} onChange={setNewPassword} placeholder="8文字以上" />
          <FormInput label="新しいパスワード（確認）" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? '...' : '変更する'}
          </button>
        </form>
      )}
    </Overlay>
  );
}

/* ─── メールアドレス変更パネル ─── */

function ChangeEmailPanel({ currentEmail, onSuccess, onClose }: { currentEmail: string; onSuccess: (email: string) => void; onClose: () => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setError('有効なメールアドレスを入力してください');
      return;
    }
    if (newEmail === currentEmail) {
      setError('現在と同じメールアドレスです');
      return;
    }
    setLoading(true);
    try {
      const result = await api.changeEmail(newEmail.trim());
      onSuccess(result.email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay title="メールアドレス変更" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">現在のメールアドレス</p>
          <p className="text-sm text-gray-700">{currentEmail}</p>
        </div>
        <FormInput label="新しいメールアドレス" type="email" value={newEmail} onChange={setNewEmail} placeholder="mail@example.com" autoFocus />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? '...' : '変更する'}
        </button>
      </form>
    </Overlay>
  );
}

/* ─── アカウント削除パネル ─── */

function DeleteAccountPanel({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (confirmText !== '削除') {
      setError('「削除」と入力してください');
      return;
    }
    setLoading(true);
    try {
      await api.deleteAccount();
      onDeleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      setLoading(false);
    }
  }

  return (
    <Overlay title="アカウント削除" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          アカウントを削除すると、全てのデータが完全に削除されます。この操作は取り消せません。
        </p>
        <FormInput
          label="確認のため「削除」と入力"
          value={confirmText}
          onChange={setConfirmText}
          placeholder="削除"
          autoFocus
        />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button
          onClick={handleDelete}
          disabled={loading || confirmText !== '削除'}
          className="w-full py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? '...' : 'アカウントを削除する'}
        </button>
      </div>
    </Overlay>
  );
}

/* ─── 共通UI ─── */

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-t-2xl px-5 pt-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormInput({ label, type = 'text', value, onChange, placeholder, autoFocus }: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
      />
    </div>
  );
}
