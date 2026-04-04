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
    <div className="flex-1 overflow-y-auto overscroll-none px-5 py-6 bg-gray-50">
      {/* Avatar */}
      <div className="flex flex-col items-center mb-6">
        <button
          onClick={() => setIconPickerOpen(!iconPickerOpen)}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-4xl shadow-lg mb-3 relative"
        >
          {profileIcon}
          <span className="absolute -bottom-0.5 -right-0.5 bg-gray-800 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">+</span>
        </button>

        {iconPickerOpen && (
          <div className="bg-white rounded-xl shadow-lg p-3 mb-3 grid grid-cols-8 gap-2">
            {ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                onClick={() => handleSelectIcon(icon)}
                className={`text-xl w-8 h-8 rounded-lg flex items-center justify-center hover:bg-orange-50 ${profileIcon === icon ? 'bg-orange-100 ring-2 ring-orange-400' : ''}`}
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
              className="text-center text-lg font-bold border-b-2 border-orange-400 outline-none bg-transparent w-40 text-gray-900"
              autoFocus
              maxLength={50}
            />
            {nicknameError && <p className="text-red-500 text-xs">{nicknameError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSaveNickname} className="text-xs px-3 py-1 bg-orange-500 text-white rounded-full">保存</button>
              <button onClick={() => setEditingNickname(false)} className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded-full">キャンセル</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNicknameInput(user?.nickname ?? ''); setEditingNickname(true); }}
            className="text-lg font-bold text-gray-900 flex items-center gap-1"
          >
            {user?.nickname ?? 'ユーザー'}
            <span className="text-gray-300 text-sm">✏️</span>
          </button>
        )}
        <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-8 mb-6 pb-5 border-b border-gray-200">
        <div className="text-center">
          <p className="text-2xl font-bold text-orange-500">{stockCount}</p>
          <p className="text-[10px] text-gray-400">ストック</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-500">{visitedCount}</p>
          <p className="text-[10px] text-gray-400">行った</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-orange-500">{likeRate}%</p>
          <p className="text-[10px] text-gray-400">○率</p>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-0">
        <MenuItem icon="📍" label="エリア設定" onClick={() => {}} />
        <MenuItem icon="🔑" label="パスワード変更" onClick={() => {}} />
        <MenuItem icon="🚪" label="ログアウト" onClick={logout} danger />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 py-3.5 border-b border-gray-100 text-left ${danger ? 'text-red-500' : 'text-gray-700'}`}
    >
      <span className="text-lg w-6 text-center">{icon}</span>
      <span className="text-sm flex-1">{label}</span>
      <span className="text-gray-300 text-sm">›</span>
    </button>
  );
}
