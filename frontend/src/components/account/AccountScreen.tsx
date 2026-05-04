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
import { FeedbackSheet } from '../feedback/FeedbackSheet';

interface Props {
  stocks: StockedRestaurant[];
  onRestaurantEdited?: () => void;
}

type Panel = null | 'password' | 'email' | 'deleteAccount' | 'theme' | 'language' | 'feedback' | 'support' | 'howto' | 'privacy' | 'terms';
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
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [listPanel, setListPanel] = useState<ListPanel>(null);
  const [followingCount, setFollowingCount] = useState(() => Number(localStorage.getItem('cache:followingCount')) || 0);
  const [followingList, setFollowingList] = useState<{ followeeId: string; nickname?: string }[]>([]);
  const [followersCount, setFollowersCount] = useState(() => Number(localStorage.getItem('cache:followersCount')) || 0);
  const [followersList, setFollowersList] = useState<{ followerId: string; nickname?: string }[]>([]);
  const [isPrivate, setIsPrivate] = useState(() => localStorage.getItem('cache:isPrivate') === '1');
  const [showInfluencerDashboard, setShowInfluencerDashboard] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<api.UploadApplicationStatus>('none');
  const [uploadStatusLoading, setUploadStatusLoading] = useState(false);
  const [applyingUpload, setApplyingUpload] = useState(false);

  const safeStocks = stocks ?? [];
  const visitedCount = safeStocks.filter((s) => s.visited).length;

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
    setUploadStatusLoading(true);
    api.getUploadApplication()
      .then((r) => setUploadStatus(r.status))
      .catch(() => setUploadStatus('none'))
      .finally(() => setUploadStatusLoading(false));
  }, []);

  async function handleApplyToPost() {
    if (applyingUpload) return;
    setApplyingUpload(true);
    try {
      const r = await api.submitUploadApplication();
      setUploadStatus(r.status);
    } catch {
      // 失敗しても UI は維持
    } finally {
      setApplyingUpload(false);
    }
  }

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

  async function handleProfilePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    setUploadingPhoto(true);
    try {
      const url = await api.uploadPhoto(file);
      setProfileImage(url);
      localStorage.setItem('cache:profileImage', url);
      await api.putSettings({ profileImage: url });
    } catch {}
    finally { setUploadingPhoto(false); }
    e.target.value = '';
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    if (file.size > 8 * 1024 * 1024) return;
    setUploadingCover(true);
    try {
      const url = await api.uploadPhoto(file);
      setCoverImage(url);
      localStorage.setItem('cache:coverImage', url);
      await api.putSettings({ coverImage: url });
    } catch {}
    finally { setUploadingCover(false); }
    e.target.value = '';
  }

  async function handleRemoveCover() {
    setCoverImage('');
    localStorage.removeItem('cache:coverImage');
    try { await api.putSettings({ coverImage: '' }); } catch {}
  }

  if (showInfluencerDashboard) {
    return <InfluencerDashboard onBack={() => { setShowInfluencerDashboard(false); onRestaurantEdited?.(); }} />;
  }

  // 設定タイル定義（再利用）
  const themeLabel = t(`account.theme${theme === 'white' ? 'White' : theme === 'black' ? 'Black' : theme === 'wood' ? 'Wood' : 'Auto'}`);
  const settingTiles: SettingTileDef[] = [
    {
      label: t('account.theme'),
      value: themeLabel,
      onClick: () => setPanel('theme'),
      iconBg: '#f97316',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>),
    },
    {
      label: t('account.language'),
      value: language === 'ja' ? '日本語' : 'English',
      onClick: () => setPanel('language'),
      iconBg: '#3b82f6',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>),
    },
    {
      label: t('account.changePassword'),
      onClick: () => setPanel('password'),
      iconBg: '#f59e0b',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
    },
    {
      label: t('account.changeEmail'),
      onClick: () => setPanel('email'),
      iconBg: '#10b981',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
    },
  ];

  const supportTiles: SettingTileDef[] = [
    {
      label: t('account.howToUse'),
      onClick: () => setPanel('howto'),
      iconBg: '#a855f7',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>),
    },
    {
      label: t('account.feedback'),
      onClick: () => setPanel('feedback'),
      iconBg: '#ec4899',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>),
    },
    {
      label: t('account.contactUs'),
      onClick: () => setPanel('support'),
      iconBg: '#f97316',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
    },
    {
      label: t('account.privacyPolicy'),
      onClick: () => setPanel('privacy'),
      iconBg: '#6b7280',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><circle cx="12" cy="16" r="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
    },
    {
      label: t('account.termsOfService'),
      onClick: () => setPanel('terms'),
      iconBg: '#64748b',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>),
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
            {/* Cover edit controls (top-right) */}
            <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
            {/* Avatar + identity row — pull-up を浅めにして名前とカバーの間に余白を確保 */}
            <div className="-mt-8 sm:-mt-10 lg:-mt-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 min-w-0">
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

                {/* Name + email */}
                <div className="min-w-0 sm:pb-1.5">
                  {editingNickname ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          value={nicknameInput}
                          onChange={(e) => setNicknameInput(e.target.value)}
                          className="text-[18px] sm:text-[20px] font-extrabold tracking-[-0.02em] border-b-2 outline-none bg-transparent w-full max-w-[200px] text-[var(--text-primary)] py-0.5"
                          style={{ borderColor: 'var(--accent-orange)' }}
                          autoFocus
                          maxLength={50}
                        />
                        <button onClick={handleSaveNickname} className="text-[12px] font-semibold px-3 py-1 rounded-full text-white" style={{ background: 'var(--accent-orange)' }}>{t('common.save')}</button>
                        <button onClick={() => setEditingNickname(false)} className="text-[12px] font-semibold px-3 py-1 rounded-full bg-[var(--bg-soft)] text-[var(--text-secondary)]">{t('common.cancel')}</button>
                      </div>
                      {nicknameError && <p className="text-red-500 text-[11px] mt-1">{nicknameError}</p>}
                    </>
                  ) : (
                    <>
                      <h1 className="text-[22px] sm:text-[24px] lg:text-[28px] font-extrabold tracking-[-0.02em] truncate">
                        {user?.nickname ?? 'ユーザー'}
                      </h1>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 truncate">{user?.email}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {!editingNickname && (
                <div className="flex flex-wrap gap-2 sm:pb-1.5">
                  <button
                    onClick={() => { setNicknameInput(user?.nickname ?? ''); setEditingNickname(true); }}
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

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 sm:gap-4 mt-6 pt-5 border-t border-[var(--border)]">
              {stats.map((s, i) => (
                <button
                  key={i}
                  onClick={s.onClick}
                  className="flex flex-col items-center justify-center py-1 rounded-[var(--radius-md)] hover:bg-[var(--bg-soft)] transition-colors"
                  aria-label={s.label}
                >
                  <span className="text-[20px] sm:text-[22px] lg:text-[26px] font-extrabold tabular-nums">{s.count}</span>
                  <span className="text-[11px] sm:text-[12px] text-[var(--text-tertiary)] mt-0.5">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Apply / Edit spots banner ─── */}
        <div className="mb-6">
          {uploadStatusLoading ? (
            <div className="rounded-[var(--radius-xl)] px-5 py-4 bg-[var(--bg-soft)] flex items-center justify-center">
              <span className="text-[13px] text-[var(--text-tertiary)]">…</span>
            </div>
          ) : uploadStatus === 'approved' ? (
            <button
              onClick={() => setShowInfluencerDashboard(true)}
              className="w-full rounded-[var(--radius-xl)] px-5 py-4 flex items-center justify-between text-white shadow-[var(--shadow)] hover:shadow-[var(--shadow-md)] transition-all"
              style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white/20 grid place-items-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </span>
                <span className="text-[14px] font-bold">{t('account.editSpots')}</span>
              </div>
              <span className="text-white/60 text-lg">›</span>
            </button>
          ) : uploadStatus === 'pending' ? (
            <div className="w-full rounded-[var(--radius-xl)] px-5 py-4 flex items-center justify-between bg-[var(--bg-soft)] border border-[var(--border)]">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full grid place-items-center" style={{ background: 'var(--accent-orange)', opacity: 0.15 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-orange)' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <span className="text-[14px] font-bold text-[var(--text-secondary)]">{t('account.pendingReview')}</span>
              </div>
            </div>
          ) : uploadStatus === 'rejected' ? (
            <div className="w-full rounded-[var(--radius-xl)] px-5 py-4 flex items-center justify-between bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-red-500/15 grid place-items-center text-red-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </span>
                <span className="text-[14px] font-bold text-red-500">{t('account.applicationRejected')}</span>
              </div>
            </div>
          ) : (
            <button
              onClick={handleApplyToPost}
              disabled={applyingUpload}
              className="w-full rounded-[var(--radius-xl)] px-5 py-4 flex items-center justify-between text-white shadow-[var(--shadow)] hover:shadow-[var(--shadow-md)] transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white/20 grid place-items-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                </span>
                <span className="text-[14px] font-bold">{applyingUpload ? '…' : t('account.applyToPost')}</span>
              </div>
              <span className="text-white/60 text-lg">›</span>
            </button>
          )}
        </div>

        {/* ─── Privacy toggle (special row) ─── */}
        <SectionLabel>{t('account.settings')}</SectionLabel>
        <div className="rounded-[var(--radius-xl)] bg-[var(--card-bg)] border border-[var(--border)] shadow-[var(--shadow-sm)] px-4 sm:px-5 py-3.5 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-[var(--radius-md)] grid place-items-center flex-shrink-0" style={{ background: '#6b7280' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate">{t('account.privateAccount')}</div>
              <div className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5 truncate">{t('account.privateAccountHint')}</div>
            </div>
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

        {/* ─── Settings tile grid ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 mb-8">
          {settingTiles.map((tile, i) => <SettingTile key={i} {...tile} />)}
        </div>

        {/* ─── Support grid ─── */}
        <SectionLabel>{t('account.support')}</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {supportTiles.map((tile, i) => <SettingTile key={i} {...tile} />)}
        </div>

        {/* ─── Danger zone ─── */}
        <SectionLabel>{t('account.other')}</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setPanel('deleteAccount')}
            className="group flex items-center gap-3 px-4 py-3.5 rounded-[var(--radius-xl)] bg-[var(--card-bg)] border border-[var(--border)] hover:border-red-300 dark:hover:border-red-900 hover:shadow-[var(--shadow-md)] transition-all text-left"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] grid place-items-center flex-shrink-0" style={{ background: '#ef4444' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </div>
            <span className="flex-1 text-[14px] font-semibold text-red-500">{t('account.deleteAccount')}</span>
            <span className="text-[var(--text-tertiary)] opacity-60 group-hover:opacity-100 transition-opacity">›</span>
          </button>
          <button
            onClick={logout}
            className="group flex items-center gap-3 px-4 py-3.5 rounded-[var(--radius-xl)] bg-[var(--card-bg)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all text-left"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] grid place-items-center flex-shrink-0" style={{ background: 'var(--text-primary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--card-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            </div>
            <span className="flex-1 text-[14px] font-semibold">{t('auth.logOut')}</span>
            <span className="text-[var(--text-tertiary)] opacity-60 group-hover:opacity-100 transition-opacity">›</span>
          </button>
        </div>

        <p className="text-center text-[11px] text-[var(--text-tertiary)] mt-8">ストグル v1.0</p>
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
      {panel === 'privacy' && (
        <StaticTextSheet
          onClose={() => setPanel(null)}
          title={t('account.privacyPolicy')}
          body={'本アプリは、利用に必要な範囲で位置情報・利用ログを取得します。詳細は https://soybeans02.github.io/stoguru/privacy.html を参照してください。'}
        />
      )}
      {panel === 'terms' && (
        <StaticTextSheet
          onClose={() => setPanel(null)}
          title={t('account.termsOfService')}
          body={'ストグルをご利用いただきありがとうございます。利用規約の全文は https://soybeans02.github.io/stoguru/terms.html を参照してください。'}
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
  value?: string;
  onClick: () => void;
  iconBg: string;
  icon: React.ReactNode;
};

function SettingTile({ label, value, onClick, iconBg, icon }: SettingTileDef) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-4 py-3.5 rounded-[var(--radius-xl)] bg-[var(--card-bg)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-[var(--radius-md)] grid place-items-center flex-shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate">{label}</div>
        {value && <div className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">{value}</div>}
      </div>
      <span className="text-[var(--text-tertiary)] opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0">›</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.08em] mb-2.5 pl-1">
      {children}
    </p>
  );
}

/* ─── テーマ選択シート ─── */
function ThemeSheet({ onClose, theme, setTheme, t }: {
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const options: { value: Theme; preview: string; gradient: string; }[] = [
    { value: 'white', preview: t('account.themeWhite'), gradient: 'bg-gradient-to-br from-gray-100 to-white border-gray-200' },
    { value: 'black', preview: t('account.themeBlack'), gradient: 'bg-gradient-to-br from-gray-900 to-black border-gray-700' },
    { value: 'wood', preview: t('account.themeWood'), gradient: 'bg-gradient-to-br from-amber-200 to-amber-700 border-amber-300' },
    { value: 'auto', preview: t('account.themeAuto'), gradient: 'bg-gradient-to-br from-gray-100 via-gray-500 to-black border-gray-300' },
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
