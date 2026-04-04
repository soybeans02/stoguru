import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';

interface Props {
  stockCount: number;
  visitedCount: number;
  likeRate: number;
}

export function AccountScreen({ stockCount, visitedCount, likeRate }: Props) {
  const { user, logout, updateNickname } = useAuth();
  const [profileIcon, setProfileIcon] = useState('🍕');
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  useEffect(() => {
    api.fetchSettings().then((s) => {
      if (s.profileIcon) setProfileIcon(s.profileIcon);
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
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{stockCount}</p>
          <p className="text-[10px] text-gray-400">ストック</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{visitedCount}</p>
          <p className="text-[10px] text-gray-400">行った</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{likeRate}%</p>
          <p className="text-[10px] text-gray-400">Like率</p>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-0">
        <MenuItem label="エリア設定" onClick={() => {}} />
        <MenuItem label="パスワード変更" onClick={() => {}} />
        <MenuItem label="ログアウト" onClick={logout} danger />
      </div>
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
