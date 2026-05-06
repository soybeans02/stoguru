import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import type { Language } from '../../i18n';
import * as api from '../../utils/api';
import type { StockedRestaurant } from '../stock/StockScreen';
import { InfluencerDashboard } from '../influencer/InfluencerDashboard';
import { Sheet } from '../ui/Sheet';
import { Toggle } from '../ui/Toggle';
import { Input } from '../ui/Input';
import { FeedbackSheet } from '../feedback/FeedbackSheet';
import { LegalSheet } from '../legal/LegalDocs';

interface Props {
  stocks: StockedRestaurant[];
  onRestaurantEdited?: () => void;
}

type Panel = null | 'password' | 'email' | 'deleteAccount' | 'theme' | 'language' | 'feedback' | 'support' | 'howto' | 'privacy' | 'terms' | 'cookie' | 'commerce' | 'editProfile';
type ListPanel = null | 'stocks' | 'visited' | 'following' | 'followers';

export function AccountScreen({ stocks, onRestaurantEdited }: Props) {
  const { user, logout, updateNickname, updateEmail } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const [profileIcon, setProfileIcon] = useState(() => localStorage.getItem('cache:profileIcon') || '🍕');
  const [profileImage, setProfileImage] = useState(() => localStorage.getItem('cache:profileImage') || '');
  const [coverImage, setCoverImage] = useState(() => localStorage.getItem('cache:coverImage') || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // editingNickname は EditProfilePanel に置き換えたので常に false。
  // 既存 JSX の {!editingNickname && ...} ガードは互換のため残す。
  const editingNickname = false;
  const [panel, setPanel] = useState<Panel>(null);
  const [listPanel, setListPanel] = useState<ListPanel>(null);
  const [followingCount, setFollowingCount] = useState(() => Number(localStorage.getItem('cache:followingCount')) || 0);
  const [followingList, setFollowingList] = useState<{ followeeId: string; nickname?: string }[]>([]);
  const [followersCount, setFollowersCount] = useState(() => Number(localStorage.getItem('cache:followersCount')) || 0);
  const [followersList, setFollowersList] = useState<{ followerId: string; nickname?: string }[]>([]);
  const [isPrivate, setIsPrivate] = useState(() => localStorage.getItem('cache:isPrivate') === '1');
  const [showInfluencerDashboard, setShowInfluencerDashboard] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<api.UploadApplicationStatus>('none');
  // 投稿申請バナーを UI から外したので uploadStatusLoading / applyingUpload は不要。
  // 通知設定（バックエンド未実装なのでクライアント側 localStorage 永続）
  const [pushNotif, setPushNotif] = useState(() => localStorage.getItem('cache:pushNotif') !== '0');
  const [emailNotif, setEmailNotif] = useState(() => localStorage.getItem('cache:emailNotif') === '1');

  const safeStocks = stocks ?? [];
  const visitedCount = safeStocks.filter((s) => s.visited).length;
  // 7 日ストリーク（直近 7 日でお店を保存した日数）— Claude Design の活動バナー用
  const streakDays = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = new Set<string>();
    for (const s of safeStocks) {
      const c = (s as { stockedAt?: string; createdAt?: string }).stockedAt
        ?? (s as { stockedAt?: string; createdAt?: string }).createdAt;
      if (!c) continue;
      const d = new Date(c);
      const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) days.add(d.toISOString().slice(0, 10));
    }
    return Math.min(7, days.size);
  })();
  // 認証バッジは design 準拠で常時表示（後で本実装に差し替え予定）。
  // uploadStatus を見るのは内部の運営フロー用に残しておく。
  void uploadStatus;
  const isVerified = true;

  useEffect(() => {
    api.fetchSettings().then((s) => {
      if (s.profileIcon) {
        setProfileIcon(s.profileIcon);
        localStorage.setItem('cache:profileIcon', s.profileIcon);
      }
      if (s.profileImage) {
        setProfileImage(s.profileImage as string);
        localStorage.setItem('cache:profileImage', s.profileImage as string);
      }
      if (s.coverImage) {
        setCoverImage(s.coverImage as string);
        localStorage.setItem('cache:coverImage', s.coverImage as string);
      }
    }).catch(() => {});
    api.getPrivacySettings().then((p) => {
      setIsPrivate(p.isPrivate);
      localStorage.setItem('cache:isPrivate', p.isPrivate ? '1' : '0');
    }).catch(() => {});
    api.getFollowing().then(async (f) => {
      setFollowingCount(f.length);
      localStorage.setItem('cache:followingCount', String(f.length));
      // ニックネームを解決
      const withNicks = await Promise.all(f.map(async (item) => {
        try {
          const p = await api.getUserProfile(item.followeeId);
          return { ...item, nickname: p.nickname };
        } catch { return item; }
      }));
      setFollowingList(withNicks);
    }).catch(() => {});
    api.getFollowers().then(async (f) => {
      setFollowersCount(f.length);
      localStorage.setItem('cache:followersCount', String(f.length));
      const withNicks = await Promise.all(f.map(async (item) => {
        try {
          const p = await api.getUserProfile(item.followerId);
          return { ...item, nickname: p.nickname };
        } catch { return item; }
      }));
      setFollowersList(withNicks);
    }).catch(() => {});
    api.getUploadApplication()
      .then((r) => setUploadStatus(r.status))
      .catch(() => setUploadStatus('none'));
  }, []);

  // ニックネーム保存は EditProfilePanel 内で updateNickname() を直接呼ぶ
  // ので、ここに専用ハンドラは不要。

  async function handleProfilePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('JPEG / PNG / WebP のみアップロードできます');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('ファイルサイズは 5MB までです');
      e.target.value = '';
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await api.uploadPhoto(file);
      setProfileImage(url);
      localStorage.setItem('cache:profileImage', url);
      await api.putSettings({ profileImage: url });
    } catch (err) {
      console.error('Profile photo upload failed:', err);
      alert('アップロードに失敗しました。もう一度お試しください。');
    } finally { setUploadingPhoto(false); }
    e.target.value = '';
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('JPEG / PNG / WebP のみアップロードできます');
      e.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('ファイルサイズは 8MB までです');
      e.target.value = '';
      return;
    }
    setUploadingCover(true);
    try {
      const url = await api.uploadPhoto(file);
      setCoverImage(url);
      localStorage.setItem('cache:coverImage', url);
      await api.putSettings({ coverImage: url });
    } catch (err) {
      console.error('Cover photo upload failed:', err);
      alert('アップロードに失敗しました。もう一度お試しください。');
    } finally { setUploadingCover(false); }
    e.target.value = '';
  }

  async function handleRemoveCover() {
    setCoverImage('');
    localStorage.removeItem('cache:coverImage');
    try {
      await api.putSettings({ coverImage: '' });
    } catch (err) {
      console.error('Failed to remove cover:', err);
    }
  }

  if (showInfluencerDashboard) {
    return <InfluencerDashboard onBack={() => { setShowInfluencerDashboard(false); onRestaurantEdited?.(); }} />;
  }

  // 設定タイル定義（再利用）。Claude Design 風 ic-bg-* パレット:
  //   orange = cream 背景 + orange-500 line
  //   blue   = blue 12% + system blue
  //   purple = purple 12% + system purple
  //   amber  = orange 14% + amber
  //   green  = green 12% + system green
  //   pink   = pink 12% + magenta
  //   gray   = gray-100 + gray-700
  //   red    = red 12% + system red
  // web 版は 白 / 黒 の 2 択のみ。legacy localStorage に wood/auto が残ってても
  // 黒系（wood/auto resolved-dark）→ 黒、それ以外 → 白 とラベリング。
  const themeLabel = t(`account.theme${theme === 'black' ? 'Black' : 'White'}`);
  const settingTiles: SettingTileDef[] = [
    {
      label: t('account.theme'),
      value: themeLabel,
      sub: '外観のスタイルを変更',
      onClick: () => setPanel('theme'),
      iconBg: 'var(--stg-cream-100)',
      iconColor: 'var(--stg-orange-500)',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>),
    },
    {
      label: t('account.language'),
      value: language === 'ja' ? '日本語' : 'English',
      sub: 'アプリの表示言語',
      onClick: () => setPanel('language'),
      iconBg: 'rgba(0,122,255,0.12)',
      iconColor: 'var(--stg-blue)',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>),
    },
    {
      label: t('account.changePassword'),
      sub: 'アカウントのパスワードを更新',
      onClick: () => setPanel('password'),
      iconBg: 'rgba(255,159,10,0.14)',
      iconColor: '#FF9F0A',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12 21 1.8M16 5l3 3M14 7l3 3"/></svg>),
    },
    {
      label: t('account.changeEmail'),
      sub: user?.email,
      onClick: () => setPanel('email'),
      iconBg: 'rgba(52,199,89,0.12)',
      iconColor: 'var(--stg-green)',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>),
    },
  ];

  const supportTiles: SettingTileDef[] = [
    {
      label: t('account.howToUse'),
      sub: 'stoguru をもっと活用',
      onClick: () => setPanel('howto'),
      iconBg: 'rgba(175,82,222,0.12)',
      iconColor: '#AF52DE',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>),
    },
    {
      label: t('account.feedback'),
      sub: '機能リクエスト・不具合報告',
      onClick: () => setPanel('feedback'),
      iconBg: 'rgba(255,55,95,0.12)',
      iconColor: '#FF375F',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>),
    },
    {
      label: t('account.contactUs'),
      sub: '通常 24 時間以内に返信',
      onClick: () => setPanel('support'),
      iconBg: 'rgba(255,159,10,0.14)',
      iconColor: '#FF9F0A',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>),
    },
    {
      label: t('account.privacyPolicy'),
      sub: 'データ取り扱いについて',
      onClick: () => setPanel('privacy'),
      iconBg: 'var(--stg-gray-100)',
      iconColor: 'var(--text-secondary)',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22S2 18 2 10V4l10-2 10 2v6c0 8-10 12-10 12Z"/></svg>),
    },
    {
      label: t('account.termsOfService'),
      sub: '利用規約',
      onClick: () => setPanel('terms'),
      iconBg: 'var(--stg-gray-100)',
      iconColor: 'var(--text-secondary)',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>),
    },
  ];

  const stats = [
    { count: safeStocks.length, label: t('account.saved'), onClick: () => setListPanel('stocks') },
    { count: visitedCount, label: t('account.visited'), onClick: () => setListPanel('visited') },
    { count: followingCount, label: t('account.following'), onClick: () => setListPanel('following') },
    { count: followersCount, label: t('account.followers'), onClick: () => setListPanel('followers') },
  ];

  return (
    <div className="flex-1 overflow-y-auto overscroll-none bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        {/* ─── Hero card ─── */}
        <div className="relative rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)] bg-[var(--card-bg)] shadow-[var(--shadow-md)] mb-6">
          {/* Cover photo / gradient */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleCoverUpload}
          />
          <div className="group h-[110px] sm:h-[140px] lg:h-[160px] relative overflow-hidden">
            {coverImage ? (
              <img src={coverImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                }}
              >
                <div
                  className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.6) 0%, transparent 50%), radial-gradient(circle at 80% 100%, rgba(0,0,0,0.4) 0%, transparent 60%)',
                  }}
                />
              </div>
            )}
            {uploadingCover && (
              <div className="absolute inset-0 bg-black/50 grid place-items-center z-10">
                <span className="text-white text-sm font-medium">アップロード中…</span>
              </div>
            )}
            {/* Cover edit controls (top-right)。タッチ端末では hover が無いので
                常時 90% 表示（PC は hover で軽く強調するだけ） */}
            <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-90 sm:opacity-80 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-white text-[12px] font-semibold hover:bg-black/70 transition-colors"
                aria-label="カバー画像を変更"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                {coverImage ? 'カバーを変更' : 'カバーを追加'}
              </button>
              {coverImage && (
                <button
                  onClick={handleRemoveCover}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors"
                  aria-label="カバーを削除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              )}
            </div>
          </div>

          <div className="px-5 sm:px-7 lg:px-8 pb-6 lg:pb-7">
            {/* Avatar 行：avatar (左、cover に被せて) と action buttons (右)。
                Twitter のプロフィール準拠で、名前 / @handle / email / bio / chips は
                すべて avatar の下に配置する。 */}
            <div className="-mt-8 sm:-mt-10 lg:-mt-12 flex items-end justify-between gap-4">
              <div className="flex items-end gap-4 min-w-0">
                {/* Avatar */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleProfilePhotoUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="relative shrink-0 self-start sm:self-auto"
                  disabled={uploadingPhoto}
                  aria-label="Change profile photo"
                >
                  <div
                    className="w-[96px] h-[96px] sm:w-[112px] sm:h-[112px] lg:w-[128px] lg:h-[128px] rounded-full p-[3px] shadow-[var(--shadow-lg)]"
                    style={{ background: 'var(--card-bg)' }}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-soft)] flex items-center justify-center">
                      {profileImage ? (
                        <img src={profileImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[44px] lg:text-[52px]">{profileIcon}</span>
                      )}
                    </div>
                  </div>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <span className="text-white text-xs font-medium">...</span>
                    </div>
                  )}
                  <div
                    className="absolute bottom-1 right-1 w-8 h-8 rounded-full grid place-items-center shadow-[var(--shadow)] border-2"
                    style={{ background: 'var(--accent-orange)', borderColor: 'var(--card-bg)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                  </div>
                </button>

                {/* avatar の右にはもう何も置かない。Twitter 風で名前 / @handle /
                    email / bio / chips は avatar の下 (full-width) に並べる。 */}
              </div>

              {/* Action buttons — 上の行（avatar と同じ row）の右端 */}
              {!editingNickname && (
                <div className="flex flex-wrap gap-2 sm:pb-1.5">
                  <button
                    onClick={() => setPanel('editProfile')}
                    className="px-4 py-2 rounded-full border border-[var(--border-strong)] bg-[var(--card-bg)] text-[12.5px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] transition-colors"
                  >
                    {t('account.editProfile')}
                  </button>
                  {uploadStatus === 'approved' && (
                    <button
                      onClick={() => setShowInfluencerDashboard(true)}
                      className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all"
                      style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
                    >
                      {t('account.editSpots')}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const url = `${window.location.origin}/u/${user?.userId ?? ''}`;
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: 'stoguru', url });
                        } else {
                          await navigator.clipboard.writeText(url);
                          alert(t('account.profileShareCopied'));
                        }
                      } catch { /* user cancelled */ }
                    }}
                    className="px-4 py-2 rounded-full border border-[var(--border-strong)] bg-[var(--card-bg)] text-[12.5px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] transition-colors"
                  >
                    {t('account.share')}
                  </button>
                </div>
              )}
            </div>

            {/* ─── avatar の下：name + verified + @handle + email + bio + chips。
                Twitter 風プロフィール。プロフィール画像と同じ列に出す。 */}
            {!editingNickname && (
              <div className="mt-3">
                <h1
                  className="font-extrabold tracking-[-0.025em] flex items-center gap-2.5"
                  style={{ fontSize: 24, color: 'var(--text-primary)', lineHeight: 1.15 }}
                >
                  <span className="truncate">{user?.nickname ?? 'ユーザー'}</span>
                  {isVerified && (
                    <span
                      aria-label="認証済み"
                      className="inline-grid place-items-center flex-shrink-0"
                      style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--stg-blue)', color: 'white' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    </span>
                  )}
                </h1>
                <div
                  className="truncate mt-0.5"
                  style={{ fontSize: 14, color: 'var(--text-secondary)' }}
                >
                  @{user?.nickname ?? ''}
                </div>
                <div
                  className="truncate mt-1"
                  style={{ fontSize: 13, color: 'var(--text-tertiary)' }}
                >
                  {user?.email}
                </div>
                <p
                  className="leading-[1.6] max-w-[640px] mt-3"
                  style={{ fontSize: 14, color: 'var(--text-secondary)' }}
                >
                  {(user as { bio?: string } | null | undefined)?.bio
                    ?? 'お気に入りのお店をスワイプで集めて、行きたい時にすぐ思い出すための私だけのリスト。'}
                </p>
                {/* design 準拠の 3 chip：好きジャンル / 住んでる地域 / 利用開始月。 */}
                {(() => {
                  const favGenre = (typeof localStorage !== 'undefined'
                    ? localStorage.getItem('cache:favoriteGenre')
                    : null) || 'グルメ';
                  const region = (typeof localStorage !== 'undefined'
                    ? localStorage.getItem('cache:region')
                    : null) || '日本';
                  let joinedLabel = '';
                  try {
                    const dates = safeStocks
                      .map((s) => (s as { stockedAt?: string; createdAt?: string }).stockedAt
                        ?? (s as { stockedAt?: string; createdAt?: string }).createdAt
                        ?? '')
                      .filter(Boolean)
                      .map((d) => new Date(d).getTime())
                      .filter((n) => Number.isFinite(n));
                    const earliest = dates.length ? Math.min(...dates) : Date.now();
                    const dt = new Date(earliest);
                    joinedLabel = `${dt.getFullYear()}年${dt.getMonth() + 1}月から利用`;
                  } catch { joinedLabel = '利用中'; }
                  const chipStyle: React.CSSProperties = {
                    fontSize: 12,
                    padding: '6px 14px',
                    borderRadius: 999,
                    background: 'var(--stg-cream-200)',
                    color: 'var(--stg-orange-700)',
                    border: '1px solid rgba(254,141,40,0.20)',
                  };
                  return (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-semibold" style={chipStyle}>
                        🍜 {favGenre}好き
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold" style={chipStyle}>
                        📍 {region}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold" style={chipStyle}>
                        🕐 {joinedLabel}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
          {/* Stats row — Claude Design: 4 セル、間に縦罫、hover で薄いクリーム */}
          <div
            className="grid grid-cols-4"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {stats.map((s, i) => (
              <button
                key={i}
                onClick={s.onClick}
                /* hover bg を theme-aware に。stg-cream-50 (#FEFBF7) は
                   dark mode で light bg + light text = 不可視 になっていた。 */
                className="flex flex-col items-center justify-center py-4 transition-colors hover:bg-[var(--bg-soft)]"
                style={i < stats.length - 1 ? { borderRight: '1px solid var(--border)' } : undefined}
                aria-label={s.label}
              >
                <span
                  className="font-extrabold tabular-nums leading-none"
                  style={{ fontSize: 26, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}
                >
                  {s.count}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Apply / Edit spots banner（投稿申請フロー）は design に無いので削除済。
            投稿は誰でもできる前提に切り替える plan に従い、UI から外す。
            uploadStatus の state や InfluencerDashboard は残しておくが、
            本パネルからはアクセスしない。 */}

        {/* ─── ストリークバナー（7 日連続保存 + 炎ゲージ） ─── */}
        {safeStocks.length > 0 && (
          <div
            className="relative overflow-hidden mb-7 flex flex-col sm:flex-row items-start sm:items-center gap-5 px-6 py-5"
            style={{
              background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
              color: 'white',
              borderRadius: 16,
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 90% 50%, rgba(254,141,40,0.20) 0%, transparent 50%)' }}
            />
            <div
              className="grid place-items-center flex-shrink-0 relative"
              style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--stg-orange-400), var(--stg-orange-600))',
                boxShadow: '0 8px 20px rgba(254,141,40,0.40)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4c0 5-3 5-3 9a3 3 0 0 0 6 0c0-1.5-.5-2.5-1.5-3.5C16.5 11 18 12.5 18 15a6 6 0 0 1-12 0c0-3 2-5 3-7 .5-1 1-2 1-3 .5 0 4 1 4-1Z"/></svg>
            </div>
            <div className="relative flex-1 min-w-0">
              <div className="text-[17px] font-bold mb-1">
                {streakDays >= 7 ? '7 日連続でお店を保存！' : `${streakDays} 日連続でお店を保存中！`}
              </div>
              <div className="text-[13px] leading-[1.5]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {streakDays >= 7
                  ? 'お見事！「ストグルマスター」相当のペース。'
                  : `あと ${7 - streakDays} 日続けると「ストグルマスター」バッジを獲得できます`}
              </div>
              {/* 7-day flame indicator */}
              <div className="flex gap-1 mt-2.5">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => {
                  const lit = i <= streakDays;
                  return (
                    <div
                      key={i}
                      style={{
                        width: 22, height: 26,
                        borderRadius: '50% 50% 50% 50% / 30% 30% 70% 70%',
                        background: lit
                          ? 'linear-gradient(180deg, #FBBF24, var(--stg-orange-500), #DC2626)'
                          : 'rgba(255,255,255,0.20)',
                        opacity: lit ? 0.92 : 0.18,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <button
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2.5 flex-shrink-0"
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: 'white',
                borderRadius: 10,
                cursor: 'pointer',
              }}
              onClick={() => alert('バッジ機能は近日対応予定')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.4 14 6.7l5.8.8-4.2 4 1 5.7-5.1-2.7L6.4 17.3l1-5.7-4.2-4 5.8-.8z"/></svg>
              バッジを見る
            </button>
          </div>
        )}

        {/* PRO アップグレードカードは design に無いので削除（将来の有料プラン
            機能を実装するときに再導入する）。 */}

        {/* ─── 連携アカウント（プレースホルダ：将来の OAuth 連携機能向け） ─── */}
        <SectionLabel>連携アカウント</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-2">
          {[
            { name: 'TikTok', sub: '未接続', bg: 'linear-gradient(135deg, #FF0050, #00F2EA)', svg: <path fill="currentColor" stroke="none" d="M19.6 6.3a4.9 4.9 0 0 1-3-1.7 4.9 4.9 0 0 1-1-2.6h-3.3v13.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a6 6 0 1 0 5.1 5.9V8.7a8 8 0 0 0 4 1.3V6.7c-.1 0-.6 0-1-.4Z"/> },
            { name: 'Instagram', sub: '未接続', bg: 'linear-gradient(135deg, #FEDA77, #F58529, #DD2A7B, #8134AF)', svg: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></> },
            { name: 'YouTube', sub: '未接続', bg: '#FF0000', svg: <><rect x="2" y="6" width="20" height="12" rx="3"/><path fill="currentColor" stroke="none" d="m10 9 5 3-5 3z"/></> },
          ].map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
            >
              <div
                className="w-[38px] h-[38px] grid place-items-center flex-shrink-0 text-white"
                style={{ background: c.bg, borderRadius: 10 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{c.svg}</svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                <div className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--stg-gray-400)' }} />
                  {c.sub}
                </div>
              </div>
              <button
                disabled
                className="text-[12px] font-semibold px-3 py-1 cursor-not-allowed opacity-60"
                style={{ background: 'var(--stg-gray-100)', color: 'var(--text-secondary)', borderRadius: 8, border: 'none' }}
                title="OAuth 連携は近日対応予定"
              >
                準備中
              </button>
            </div>
          ))}
        </div>

        {/* ─── 設定 ─── */}
        <SectionLabel>{t('account.settings')}</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* 非公開アカウント — full-width toggle row */}
          <div
            className="flex items-center gap-3.5 px-4 py-3.5 sm:col-span-2"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
          >
            <div
              className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
              style={{ background: 'var(--stg-gray-100)', color: 'var(--text-secondary)', borderRadius: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t('account.privateAccount')}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{t('account.privateAccountHint')}</div>
            </div>
            <Toggle
              checked={isPrivate}
              ariaLabel={t('account.privateAccount')}
              onChange={async (next) => {
                setIsPrivate(next);
                localStorage.setItem('cache:isPrivate', next ? '1' : '0');
                try { await api.setPrivateAccount(next); } catch { setIsPrivate(!next); }
              }}
            />
          </div>
          {settingTiles.map((tile, i) => <SettingTile key={i} {...tile} />)}
        </div>

        {/* ─── 通知 ─── */}
        <SectionLabel>通知</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div
            className="flex items-center gap-3.5 px-4 py-3.5 sm:col-span-2"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
          >
            <div
              className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
              style={{ background: 'rgba(255,55,95,0.12)', color: '#FF375F', borderRadius: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>プッシュ通知</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>新着のおすすめ・フォローイベント</div>
            </div>
            <Toggle
              checked={pushNotif}
              ariaLabel="プッシュ通知"
              onChange={(next) => { setPushNotif(next); localStorage.setItem('cache:pushNotif', next ? '1' : '0'); }}
            />
          </div>
          <div
            className="flex items-center gap-3.5 px-4 py-3.5 sm:col-span-2"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
          >
            <div
              className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
              style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--stg-blue)', borderRadius: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>メール通知</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>週次のダイジェスト・お知らせ</div>
            </div>
            <Toggle
              checked={emailNotif}
              ariaLabel="メール通知"
              onChange={(next) => { setEmailNotif(next); localStorage.setItem('cache:emailNotif', next ? '1' : '0'); }}
            />
          </div>
        </div>

        {/* ─── データとプライバシー ─── */}
        <SectionLabel>データとプライバシー</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setPanel('privacy'); }}
            className="group flex items-center gap-3.5 px-4 py-3.5 transition-all hover:-translate-y-px text-left no-underline"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
          >
            <div
              className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
              style={{ background: 'var(--stg-gray-100)', color: 'var(--text-secondary)', borderRadius: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>プライバシー設定</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>公開範囲・ブロック・履歴</div>
            </div>
            <span className="text-[var(--text-tertiary)] flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </span>
          </a>
        </div>

        {/* ─── サポート ─── */}
        <SectionLabel>{t('account.support')}</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {supportTiles.map((tile, i) => <SettingTile key={i} {...tile} />)}
        </div>

        {/* ─── その他（ログアウト / アカウント削除） ─── */}
        <SectionLabel>{t('account.other')}</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={logout}
            className="group flex items-center gap-3.5 px-4 py-3.5 transition-all hover:-translate-y-px text-left"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
          >
            <div
              className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
              style={{ background: 'var(--stg-gray-100)', color: 'var(--text-secondary)', borderRadius: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t('auth.logOut')}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>このデバイスからサインアウト</div>
            </div>
            <span className="text-[var(--text-tertiary)] flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </span>
          </button>
          <button
            onClick={() => setPanel('deleteAccount')}
            className="group flex items-center gap-3.5 px-4 py-3.5 transition-all hover:-translate-y-px text-left"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--stg-gray-200)', borderRadius: 14 }}
          >
            <div
              className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
              style={{ background: 'rgba(255,69,58,0.12)', color: 'var(--stg-red)', borderRadius: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--stg-red)' }}>{t('account.deleteAccount')}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>すべてのデータが永久に削除されます</div>
            </div>
            <span className="text-[var(--text-tertiary)] flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </span>
          </button>
        </div>

        {/* ─── Footer ─── Claude Design 風 4 リンク + バージョン */}
        <div className="text-center mt-10" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <div className="flex justify-center gap-4 mb-2 flex-wrap">
            <a href="#" onClick={(e) => { e.preventDefault(); setPanel('privacy'); }} style={{ color: 'inherit', textDecoration: 'none' }}>プライバシー</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setPanel('terms'); }} style={{ color: 'inherit', textDecoration: 'none' }}>利用規約</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setPanel('cookie'); }} style={{ color: 'inherit', textDecoration: 'none' }}>クッキー</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setPanel('commerce'); }} style={{ color: 'inherit', textDecoration: 'none' }}>特定商取引</a>
          </div>
          <div>stoguru v1.0 · © 2026 stoguru</div>
        </div>
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
      {panel === 'theme' && (
        <ThemeSheet
          onClose={() => setPanel(null)}
          theme={theme}
          setTheme={setTheme}
          t={t}
        />
      )}
      {panel === 'language' && (
        <LanguageSheet
          onClose={() => setPanel(null)}
          language={language}
          setLanguage={setLanguage}
          t={t}
        />
      )}
      {panel === 'feedback' && (
        <FeedbackSheet category="general" onClose={() => setPanel(null)} />
      )}
      {panel === 'support' && (
        <FeedbackSheet category="support" onClose={() => setPanel(null)} />
      )}
      {panel === 'howto' && (
        <StaticTextSheet
          onClose={() => setPanel(null)}
          title={t('account.howToUse')}
          body={t('howto.body',
`1. ホームでスワイプ → 気になったお店を保存
2. 保存タブで一覧管理 (ピン留め・行った)
3. マップタブで近くのお店を確認
4. 検索タブでユーザー・お店・URL から探す
5. 投稿は「投稿を申請」から審査後に可能`
          )}
        />
      )}
      {panel === 'privacy' && <LegalSheet doc="privacy" onClose={() => setPanel(null)} />}
      {panel === 'terms' && <LegalSheet doc="terms" onClose={() => setPanel(null)} />}
      {panel === 'cookie' && <LegalSheet doc="cookie" onClose={() => setPanel(null)} />}
      {panel === 'commerce' && <LegalSheet doc="commerce" onClose={() => setPanel(null)} />}
      {panel === 'editProfile' && (
        <EditProfilePanel
          currentNickname={user?.nickname ?? ''}
          onSave={async (next) => {
            // ニックネームだけサーバー側に反映、bio / 好きジャンル / 地域は
            // 現状 cache（バックエンドに専用カラムがまだ無い）。
            try {
              if (next.nickname && next.nickname !== user?.nickname) {
                await updateNickname(next.nickname);
              }
            } catch (e) {
              alert(e instanceof Error ? e.message : 'ニックネームの更新に失敗しました');
              return;
            }
            if (next.favoriteGenre) localStorage.setItem('cache:favoriteGenre', next.favoriteGenre);
            else localStorage.removeItem('cache:favoriteGenre');
            if (next.region) localStorage.setItem('cache:region', next.region);
            else localStorage.removeItem('cache:region');
            if (next.bio) localStorage.setItem('cache:bio', next.bio);
            else localStorage.removeItem('cache:bio');
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {/* List panels */}
      {listPanel === 'stocks' && (
        <Overlay title="保存" onClose={() => setListPanel(null)}>
          {safeStocks.filter(s => !s.visited).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">まだ保存がないよ</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {safeStocks.filter(s => !s.visited).map(s => (
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
          {safeStocks.filter(s => s.visited).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">まだ行ったお店がないよ</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {safeStocks.filter(s => s.visited).map(s => (
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
      {listPanel === 'followers' && (
        <Overlay title="フォロワー" onClose={() => setListPanel(null)}>
          {followersList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">まだフォロワーがいないよ</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {followersList.map(f => (
                <div key={f.followerId} className="flex items-center gap-3 py-2 border-b border-gray-50">
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">👤</span>
                  <p className="text-sm text-gray-900">{f.nickname ?? f.followerId}</p>
                </div>
              ))}
            </div>
          )}
        </Overlay>
      )}
    </div>
  );
}

/* ─── 新デザイン: 設定タイル ─── */

type SettingTileDef = {
  label: string;
  /** 右端に出すサマリ値（Claude Design 風だと "自動" / "日本語" 等） */
  value?: string;
  /** 説明文（タイトル下に薄文字で出す） */
  sub?: string;
  onClick: () => void;
  /** アイコンタイル背景 */
  iconBg: string;
  /** アイコンの線 / 塗り色（白以外を使いたい時。例: ic-bg-orange は cream 背景 + orange line） */
  iconColor?: string;
  icon: React.ReactNode;
};

function SettingTile({ label, value, sub, onClick, iconBg, iconColor, icon }: SettingTileDef & { sub?: string; iconColor?: string }) {
  // Claude Design 風 setting-card: 38x38 アイコンタイル + title + sub (= description) + chev
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-all text-left hover:-translate-y-px"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--stg-gray-200)',
        borderRadius: 14,
      }}
    >
      <div
        className="w-[38px] h-[38px] grid place-items-center flex-shrink-0"
        style={{ background: iconBg, color: iconColor ?? '#fff', borderRadius: 10 }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {(sub || value) && (
          <div className="text-[12px] truncate" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{sub ?? value}</div>
        )}
      </div>
      {value && sub && (
        <span className="text-[13px] flex-shrink-0" style={{ color: 'var(--text-secondary)', marginRight: 4 }}>{value}</span>
      )}
      <span className="text-[var(--text-tertiary)] flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  // Claude Design 風 .section-h（uppercase, 13px, gray-600, letter-spacing 0.04em）
  return (
    <h2
      className="font-bold mb-3"
      style={{ fontSize: 13, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 28 }}
    >
      {children}
    </h2>
  );
}

/* ─── テーマ選択シート ─── */
function ThemeSheet({ onClose, theme, setTheme, t }: {
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (key: string, fallback?: string) => string;
}) {
  // web 版は 白 / 黒 の 2 択のみ。wood / auto は iOS native 版で復活させる前提なので
  // ThemeContextDef の type からは消さず、UI からだけ除外する。
  const options: { value: Theme; preview: string; gradient: string; }[] = [
    { value: 'white', preview: t('account.themeWhite'), gradient: 'bg-gradient-to-br from-gray-100 to-white border-gray-200' },
    { value: 'black', preview: t('account.themeBlack'), gradient: 'bg-gradient-to-br from-gray-900 to-black border-gray-700' },
  ];
  return (
    <Sheet isOpen onClose={onClose} title={t('account.theme')}>
      <p className="text-[13px] text-gray-500 mb-4">{t('account.themeDescription')}</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => { setTheme(opt.value); onClose(); }}
              className={`flex flex-col items-stretch gap-2 p-2 rounded-[14px] border transition-all ${active ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
            >
              <div className={`w-full aspect-[4/3] rounded-[10px] border ${opt.gradient}`} />
              <div className="flex items-center justify-between px-1">
                <span className="text-[13px] font-medium text-gray-700 dark:text-gray-200">{opt.preview}</span>
                {active && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ─── 言語選択シート ─── */
function LanguageSheet({ onClose, language, setLanguage, t }: {
  onClose: () => void;
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const options: { value: Language; label: string; sub: string }[] = [
    { value: 'ja', label: '日本語', sub: 'Japanese' },
    { value: 'en', label: 'English', sub: 'English' },
  ];
  return (
    <Sheet isOpen onClose={onClose} title={t('account.language')}>
      <div className="space-y-2">
        {options.map((opt) => {
          const active = language === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => { setLanguage(opt.value); onClose(); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-[12px] border transition-colors ${active ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              <div className="text-left">
                <p className="text-[14px] font-medium text-gray-900 dark:text-white">{opt.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{opt.sub}</p>
              </div>
              {active && (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ─── 静的テキストシート (privacy/terms/howto) ─── */
function StaticTextSheet({ onClose, title, body }: { onClose: () => void; title: string; body: string }) {
  return (
    <Sheet isOpen onClose={onClose} title={title} maxWidth="lg">
      <div className="text-[13px] leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{body}</div>
    </Sheet>
  );
}

/* ─── プロフィール編集 専用パネル ─── */
/* 「プロフィール編集」ボタンから開く Sheet。
   ニックネームだけサーバー反映、bio / 好きジャンル / 住んでる地域は
   現状 localStorage キャッシュ（バックエンドの user テーブルに専用
   カラムがまだ無いため）。 */
function EditProfilePanel({
  currentNickname,
  onSave,
  onClose,
}: {
  currentNickname: string;
  onSave: (next: { nickname: string; bio: string; favoriteGenre: string; region: string }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [nickname, setNickname] = useState(currentNickname);
  const [bio, setBio] = useState(() => localStorage.getItem('cache:bio') ?? '');
  const [favoriteGenre, setFavoriteGenre] = useState(() => localStorage.getItem('cache:favoriteGenre') ?? '');
  const [region, setRegion] = useState(() => localStorage.getItem('cache:region') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    const trimmed = nickname.trim();
    if (!trimmed) { setError('ニックネームを入力してください'); return; }
    if (trimmed.length > 50) { setError('ニックネームは 50 文字以内で入力してください'); return; }
    setSaving(true);
    try {
      await onSave({
        nickname: trimmed,
        bio: bio.trim(),
        favoriteGenre: favoriteGenre.trim(),
        region: region.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet isOpen onClose={onClose} title="プロフィール編集" maxWidth="lg">
      <div className="flex flex-col gap-4">
        <Input
          label="ニックネーム"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={50}
          placeholder="表示名"
        />
        <div>
          <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            自己紹介（{bio.length}/200）
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 200))}
            rows={3}
            placeholder="お気に入りのジャンル、住んでる地域、好きな店の傾向など"
            className="w-full px-3 py-2 rounded-[10px] resize-none outline-none transition-colors"
            style={{
              fontSize: 14,
              background: 'var(--bg-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <Input
          label="好きなジャンル"
          value={favoriteGenre}
          onChange={(e) => setFavoriteGenre(e.target.value)}
          maxLength={20}
          placeholder="ラーメン / カフェ / 焼肉 など"
        />
        <Input
          label="住んでる地域"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          maxLength={30}
          placeholder="大阪 / 渋谷 / 京都 など"
        />
        {error && <p className="text-red-500 text-[12px]">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-soft)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent-orange)' }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Sheet>
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
  const [currentPassword, setCurrentPassword] = useState('');
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
    if (!currentPassword) {
      setError('現在のパスワードを入力してください');
      return;
    }
    setLoading(true);
    try {
      const result = await api.changeEmail(newEmail.trim(), currentPassword);
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
        <FormInput label="現在のパスワード" type="password" value={currentPassword} onChange={setCurrentPassword} placeholder="パスワードを入力" />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? '...' : '変更する'}
        </button>
      </form>
    </Overlay>
  );
}

/* ─── アカウント削除パネル (iOS DeleteAccountSheet 同等の 3 段階確認) ─── */

type DeleteStep = 'warning' | 'typeConfirm' | 'finalConfirm';

function DeleteAccountPanel({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const nickname = user?.nickname ?? '';
  const [step, setStep] = useState<DeleteStep>('warning');
  const [typedNickname, setTypedNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const stepIndex = step === 'warning' ? 1 : step === 'typeConfirm' ? 2 : 3;
  const nicknameMatches = typedNickname.trim() === nickname.trim() && nickname.trim().length > 0;

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      await api.deleteAccount();
      onDeleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setLoading(false);
    }
  }

  return (
    <Overlay title={t('account.deleteAccount')} onClose={onClose}>
      {/* Step indicator (3 bars) */}
      <div className="flex gap-1.5 mb-5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={stepIndex} aria-label={t('deleteAccount.progress').replace('{current}', String(stepIndex))}>
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>

      {step === 'warning' && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('deleteAccount.step1Title')}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{t('deleteAccount.step1Warning')}</p>
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-3">
            <p className="text-[12px] font-semibold text-red-600 dark:text-red-400 mb-2">{t('deleteAccount.step1ListTitle')}</p>
            <ul className="text-[13px] text-gray-700 dark:text-gray-300 space-y-1.5">
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">·</span><span>{t('deleteAccount.step1Item1')}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">·</span><span>{t('deleteAccount.step1Item2')}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">·</span><span>{t('deleteAccount.step1Item3')}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-0.5">·</span><span>{t('deleteAccount.step1Item4')}</span></li>
            </ul>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium"
            >
              {t('common.close')}
            </button>
            <button
              onClick={() => setStep('typeConfirm')}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
            >
              {t('deleteAccount.step1Continue')}
            </button>
          </div>
        </div>
      )}

      {step === 'typeConfirm' && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('deleteAccount.step2Title')}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{t('deleteAccount.step2Description')}</p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">{t('auth.nickname')}</p>
            <p className="text-[15px] font-bold text-gray-900 dark:text-white">{nickname || '—'}</p>
          </div>
          <FormInput
            label={t('deleteAccount.step2Placeholder')}
            value={typedNickname}
            onChange={setTypedNickname}
            placeholder={nickname}
            autoFocus
          />
          {typedNickname.length > 0 && !nicknameMatches && (
            <p className="text-red-500 text-xs">{t('deleteAccount.step2Mismatch')}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium"
            >
              {t('common.close')}
            </button>
            <button
              onClick={() => setStep('finalConfirm')}
              disabled={!nicknameMatches}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      {step === 'finalConfirm' && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('deleteAccount.step3Title')}</h3>
          <div className="flex flex-col items-center py-3">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 text-center leading-relaxed">{t('deleteAccount.step3Description')}</p>
          </div>
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {t('common.close')}
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {loading ? '...' : t('deleteAccount.step3Delete')}
            </button>
          </div>
        </div>
      )}
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
