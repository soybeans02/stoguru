import { useState, useEffect } from 'react';
import { MapPin, Star, X, UserPlus, UserMinus, Lock } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';
import { safeHttpUrl } from '../../utils/safeUrl';
import { useTranslation } from '../../context/LanguageContext';

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
  // SNS リンク (バックエンドが influencer profile から取って返す)
  bio?: string | null;
  instagramHandle?: string | null;
  instagramUrl?: string | null;
  tiktokHandle?: string | null;
  tiktokUrl?: string | null;
  youtubeHandle?: string | null;
  youtubeUrl?: string | null;
}

interface Props {
  userId: string | null;
  onClose: () => void;
}

export function UserProfileModal({ userId, onClose }: Props) {
  const { user } = useAuth();
  const { t, language } = useTranslation();
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
        setError(t('account.profileFetchFailed'));
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
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90svh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{t('account.profileTitle')}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-400">{t('common.loading')}</p>
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
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">{t('account.profileYouBadge')}</span>
                    )}
                    {profile.isPrivate && !isMyself && (
                      <Lock size={13} className="text-gray-400 shrink-0" />
                    )}
                  </div>
                  {profile.createdAt && (
                    <p className="text-xs text-gray-400">
                      {t('account.profileJoinedAt').replace('{date}', new Date(profile.createdAt).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US'))}
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
                            : 'bg-orange-500 text-white hover:bg-orange-600'
                      } disabled:opacity-50`}
                    >
                      {isFollowing ? (
                        <span className="flex items-center gap-1.5"><UserMinus size={14} /> {t('account.profileFollowing')}</span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1.5">{t('account.profilePending')}</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><UserPlus size={14} /> {t('account.profileFollow')}</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* SNS リンク (登録されているプラットフォームだけ icon を表示)。
                  クリックで該当 SNS の URL を新規タブで開く。
                  href には必ず safeHttpUrl で http(s) のみ許可。
                  これを怠ると相手のプロフに javascript:alert(1) を仕込まれた時に
                  click → XSS で全閲覧者にスクリプトが走る。 */}
              {(() => {
                if (isLockedOut) return null;
                const igUrl = safeHttpUrl(profile.instagramUrl ?? undefined);
                const ttUrl = safeHttpUrl(profile.tiktokUrl ?? undefined);
                const ytUrl = safeHttpUrl(profile.youtubeUrl ?? undefined);
                if (!igUrl && !ttUrl && !ytUrl) return null;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    {igUrl && (
                      <a
                        href={igUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-orange-400 text-white text-xs font-semibold shadow-sm hover:shadow transition-shadow"
                        title={profile.instagramHandle ?? 'Instagram'}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                        {profile.instagramHandle ? `@${String(profile.instagramHandle).replace(/^@/, '')}` : 'Instagram'}
                      </a>
                    )}
                    {ttUrl && (
                      <a
                        href={ttUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity"
                        title={profile.tiktokHandle ?? 'TikTok'}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1Z"/></svg>
                        {profile.tiktokHandle ? `@${String(profile.tiktokHandle).replace(/^@/, '')}` : 'TikTok'}
                      </a>
                    )}
                    {ytUrl && (
                      <a
                        href={ytUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold shadow-sm hover:bg-red-700 transition-colors"
                        title={profile.youtubeHandle ?? 'YouTube'}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>
                        {profile.youtubeHandle ? `@${String(profile.youtubeHandle).replace(/^@/, '')}` : 'YouTube'}
                      </a>
                    )}
                  </div>
                );
              })()}

              {/* bio 表示（インフルエンサープロフィールに登録されてる時だけ） */}
              {!isLockedOut && profile.bio && (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
              )}

              {/* 鍵垢で閲覧不可 */}
              {isLockedOut && (
                <div className="flex flex-col items-center text-center py-8 gap-2">
                  <Lock size={32} className="text-gray-300" />
                  <p className="text-sm text-gray-500 font-medium">{t('userProfileModal.privateAccount')}</p>
                  <p className="text-xs text-gray-400">{t('userProfileModal.privateAccountHint')}</p>
                </div>
              )}

              {/* 公開情報 */}
              {!isLockedOut && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-gray-900">{profile.restaurantCount}</p>
                      <p className="text-xs text-gray-400">{t('userProfileModal.statStocks')}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-green-500">{profile.reviewedCount}</p>
                      <p className="text-xs text-gray-400">{t('userProfileModal.statReviewed')}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-blue-500">{profile.influencerCount}</p>
                      <p className="text-xs text-gray-400">{t('userProfileModal.statMembers')}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">{t('userProfileModal.storesTitle')}</p>
                    {profile.restaurants.length === 0 ? (
                      <p className="text-xs text-gray-400 py-3 text-center">{t('userProfileModal.noStores')}</p>
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
