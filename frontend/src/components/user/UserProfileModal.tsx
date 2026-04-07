import { useState, useEffect } from 'react';
import { MapPin, Star, X, UserPlus, UserMinus, Lock } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';

interface ProfileData {
  userId: string;
  nickname: string;
  createdAt: string;
  isPrivate?: boolean;
  isLockedOut?: boolean;
  restaurantCount: number;
  reviewedCount: number;
  influencerCount: number;
  restaurants: {
    name: string;
    address: string;
    hasReview: boolean;
  }[];
}

interface Props {
  userId: string | null;
  onClose: () => void;
}

export function UserProfileModal({ userId, onClose }: Props) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isMyself = userId === user?.userId;

  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    setLoading(true);
    setError('');
    setIsFollowing(false);

    const fetchData = async () => {
      try {
        const [profileData, following] = await Promise.all([
          api.getUserProfile(userId),
          api.getFollowing(),
        ]);
        setProfile(profileData);
        setIsFollowing(following.some((f) => f.followeeId === userId));
      } catch {
        setError('プロフィールを取得できませんでした');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  async function toggleFollow() {
    if (!userId || isMyself) return;
    setFollowLoading(true);
    try {
      if (isFollowing || isPending) {
        await api.unfollowUser(userId);
        setIsFollowing(false);
        setIsPending(false);
      } else {
        const result = await api.followUser(userId);
        if (result.pending) {
          setIsPending(true);
        } else {
          setIsFollowing(true);
        }
      }
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  }

  if (!userId) return null;

  const isLockedOut = !!profile?.isLockedOut;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">プロフィール</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-400">読み込み中...</p>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center justify-center py-12">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {!loading && !error && profile && (
            <div className="space-y-5">
              {/* アバター + 名前 + フォローボタン */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-sm ${
                  isMyself
                    ? 'bg-gradient-to-br from-red-400 to-orange-300'
                    : 'bg-gradient-to-br from-blue-400 to-cyan-300'
                }`}>
                  {profile.nickname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-lg truncate">{profile.nickname}</p>
                    {isMyself && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">あなた</span>
                    )}
                    {profile.isPrivate && !isMyself && (
                      <Lock size={13} className="text-gray-400 shrink-0" />
                    )}
                  </div>
                  {profile.createdAt && (
                    <p className="text-xs text-gray-400">
                      {new Date(profile.createdAt).toLocaleDateString('ja-JP')} から利用
                    </p>
                  )}
                </div>
                {!isMyself && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={toggleFollow}
                      disabled={followLoading}
                      className={`flex items-center gap-1.5 text-sm font-medium rounded-full px-4 py-2 transition-colors ${
                        isFollowing
                          ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-500'
                          : isPending
                            ? 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                      } disabled:opacity-50`}
                    >
                      {isFollowing ? (
                        <span className="flex items-center gap-1.5"><UserMinus size={14} /> フォロー中</span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1.5">リクエスト済み</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><UserPlus size={14} /> フォローする</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* 鍵垢で閲覧不可 */}
              {isLockedOut && (
                <div className="flex flex-col items-center text-center py-8 gap-2">
                  <Lock size={32} className="text-gray-300" />
                  <p className="text-sm text-gray-500 font-medium">このアカウントは非公開です</p>
                  <p className="text-xs text-gray-400">フォローするとお店情報を閲覧できます</p>
                </div>
              )}

              {/* 公開情報 */}
              {!isLockedOut && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-gray-900">{profile.restaurantCount}</p>
                      <p className="text-xs text-gray-400">ストック</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-green-500">{profile.reviewedCount}</p>
                      <p className="text-xs text-gray-400">レビュー済</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-blue-500">{profile.influencerCount}</p>
                      <p className="text-xs text-gray-400">メンバー</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">ストックしているお店</p>
                    {profile.restaurants.length === 0 ? (
                      <p className="text-xs text-gray-400 py-3 text-center">まだお店がありません</p>
                    ) : (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {profile.restaurants.map((r, i) => (
                          <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: r.hasReview ? '#86efac' : '#ef4444', opacity: r.hasReview ? 0.85 : 1 }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                              {r.address && (
                                <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                                  <MapPin size={10} /> {r.address}
                                </p>
                              )}
                            </div>
                            {r.hasReview && <Star size={12} className="text-green-400 shrink-0" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
