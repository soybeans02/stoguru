import { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown, ChevronUp, Search, ArrowUp, ArrowDown, Trash2, Pencil, User, Users, MessageCircle } from 'lucide-react';
import { useRestaurantContext } from '../../context/RestaurantContext';
import type { Influencer, Restaurant } from '../../types/restaurant';
import { InfluencerManager } from '../influencer/InfluencerManager';
import * as api from '../../utils/api';

interface SearchedUser {
  userId: string;
  nickname: string;
}

interface Props {
  onDetail: (r: Restaurant) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenMessage?: (userId: string) => void;
}

function InfluencerSection({
  influencer,
  onDetail,
}: {
  influencer: Influencer;
  onDetail: (r: Restaurant) => void;
}) {
  const { state } = useRestaurantContext();
  const [open, setOpen] = useState(true);
  const restaurants = state.restaurants.filter((r) =>
    r.influencerIds.includes(influencer.id),
  );

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 sticky top-0 bg-gray-50 z-10 min-w-0"
      >
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: influencer.color }} />
        <span className="text-sm font-semibold text-gray-800 truncate">
          {influencer.name}
        </span>
        {(influencer.tiktokHandle || influencer.instagramHandle) && (
          <span className="text-xs text-gray-400 truncate shrink-0 max-w-[30%]">@{influencer.tiktokHandle ?? influencer.instagramHandle}</span>
        )}
        <span className="ml-auto text-xs text-gray-400 mr-1 shrink-0 whitespace-nowrap">{restaurants.length}件</span>
        {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        restaurants.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 pb-2">まだ店舗が登録されていません</p>
        ) : (
          <ul className="space-y-1 px-4 pb-2">
            {restaurants.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onDetail(r)}
                  className="w-full text-left flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.review ? '#86efac' : '#ef4444', opacity: r.review ? 0.85 : 1 }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                    {r.address && <p className="text-xs text-gray-400 truncate">{r.address}</p>}
                  </div>
                  <span className="text-xs text-gray-300 shrink-0 whitespace-nowrap">
                    {r.review ? '✓ レビュー済' : '未訪問'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function EditPanel() {
  const { state, dispatch } = useRestaurantContext();
  const influencers = state.influencers;

  function moveUp(index: number) {
    if (index === 0) return;
    const arr = [...influencers];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    dispatch({ type: 'REORDER_INFLUENCERS', payload: arr });
  }

  function moveDown(index: number) {
    if (index === influencers.length - 1) return;
    const arr = [...influencers];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    dispatch({ type: 'REORDER_INFLUENCERS', payload: arr });
  }

  function remove(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？\n紐付いたお店からもこのメンバーが外れます。`)) return;
    dispatch({ type: 'DELETE_INFLUENCER', payload: { id } });
  }

  if (influencers.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">メンバーがいません</p>;
  }

  return (
    <div className="space-y-1.5 px-4 py-3">
      {influencers.map((inf, i) => (
        <div key={inf.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: inf.color }} />
          <span className="text-sm font-medium text-gray-800 flex-1 truncate">{inf.name}</span>
          <button
            onClick={() => moveUp(i)}
            disabled={i === 0}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors"
          >
            <ArrowUp size={14} className="text-gray-500" />
          </button>
          <button
            onClick={() => moveDown(i)}
            disabled={i === influencers.length - 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors"
          >
            <ArrowDown size={14} className="text-gray-500" />
          </button>
          <button
            onClick={() => remove(inf.id, inf.name)}
            className="p-1 rounded hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} className="text-red-400" />
          </button>
        </div>
      ))}
    </div>
  );
}

interface FollowedUserData {
  userId: string;
  nickname: string;
  restaurantCount: number;
}

export function KeepView({ onDetail, onOpenProfile, onOpenMessage }: Props) {
  const { state } = useRestaurantContext();
  const [managerOpen, setManagerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<SearchedUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [followedUsers, setFollowedUsers] = useState<FollowedUserData[]>([]);
  const [followSectionOpen, setFollowSectionOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // フォロー中ユーザーを取得（並列化）
  useEffect(() => {
    async function load() {
      try {
        const following = await api.getFollowing();
        const profiles = await Promise.all(
          following.map((f) => api.getUserProfile(f.followeeId).catch(() => null))
        );
        setFollowedUsers(
          profiles
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .map((p) => ({ userId: p.userId, nickname: p.nickname, restaurantCount: p.restaurantCount }))
        );
      } catch { /* ignore */ }
    }
    load();
  }, []);

  // ユーザー検索（debounce）
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchedUsers([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const users = await api.searchUsers(q);
        setSearchedUsers(users);
      } catch {
        setSearchedUsers([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const filteredInfluencers = state.influencers.filter((inf) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      inf.name.toLowerCase().includes(q) ||
      (inf.tiktokHandle?.toLowerCase().includes(q)) ||
      (inf.instagramHandle?.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b bg-white space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">キープ</h2>
            <p className="text-xs text-gray-400 mt-0.5">インフルエンサーごとのお店リスト</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => { setEditOpen((v) => !v); if (!editOpen) setManagerOpen(false); }}
              className={`flex items-center gap-1 text-xs font-medium rounded-lg px-2 py-1.5 whitespace-nowrap transition-colors ${
                editOpen
                  ? 'bg-blue-500 text-white'
                  : 'text-blue-500 border border-blue-200 hover:bg-blue-50'
              }`}
            >
              <Pencil size={12} /> 編集
            </button>
            <button
              onClick={() => { setManagerOpen((v) => !v); if (!managerOpen) setEditOpen(false); }}
              className="flex items-center gap-1 text-xs font-medium text-red-500 border border-red-200 rounded-lg px-2 py-1.5 whitespace-nowrap hover:bg-red-50 transition-colors"
            >
              <Plus size={12} /> 追加
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ユーザーを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white"
          />
        </div>
      </div>

      {/* インフルエンサー管理パネル（展開式） */}
      {managerOpen && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <InfluencerManager />
        </div>
      )}

      {/* 編集パネル */}
      {editOpen && <EditPanel />}

      {/* ユーザー検索結果 */}
      {searchQuery.trim() && (
        <div className="px-4 py-3 border-b">
          <p className="text-xs font-semibold text-gray-500 mb-2">ユーザー検索</p>
          {searchingUsers ? (
            <p className="text-xs text-gray-400 py-2">検索中...</p>
          ) : searchedUsers.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">「{searchQuery}」に一致するユーザーはいません</p>
          ) : (
            <div className="space-y-1.5">
              {searchedUsers.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => onOpenProfile?.(u.userId)}
                  className="w-full flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white text-sm font-bold">
                    {u.nickname.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-gray-800">{u.nickname}</span>
                  <User size={14} className="ml-auto text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* フォロー中ユーザー */}
      {followedUsers.length > 0 && (
        <div className="pt-3">
          <button
            onClick={() => setFollowSectionOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100"
          >
            <Users size={14} className="text-blue-500" />
            <span className="text-sm font-semibold text-blue-700">フォロー中</span>
            <span className="ml-auto text-xs text-blue-400 mr-1">{followedUsers.length}人</span>
            {followSectionOpen ? <ChevronUp size={14} className="text-blue-400" /> : <ChevronDown size={14} className="text-blue-400" />}
          </button>
          {followSectionOpen && (
            <div className="space-y-1 px-4 py-2">
              {followedUsers.map((u) => (
                <div
                  key={u.userId}
                  className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => onOpenProfile?.(u.userId)}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {u.nickname.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-medium text-gray-800 truncate">{u.nickname}</p>
                      <p className="text-xs text-gray-400">{u.restaurantCount}件ストック</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenMessage?.(u.userId); }}
                    className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors"
                    title="メッセージ"
                  >
                    <MessageCircle size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* インフルエンサーリスト */}
      {state.influencers.length === 0 && followedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center px-8 gap-3 pt-20">
          <p className="text-4xl">📋</p>
          <p className="text-sm font-medium text-gray-700">メンバーがいません</p>
          <p className="text-xs text-gray-400">上の「メンバー追加」から登録してください</p>
        </div>
      ) : filteredInfluencers.length === 0 && !searchQuery.trim() ? null : filteredInfluencers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center px-8 gap-3 pt-16">
          <p className="text-sm text-gray-400">「{searchQuery}」に一致するメンバーはいません</p>
        </div>
      ) : (
        <div className="space-y-4 pt-3">
          {filteredInfluencers.map((inf) => (
            <InfluencerSection key={inf.id} influencer={inf} onDetail={onDetail} />
          ))}
        </div>
      )}
    </div>
  );
}
