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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  if (showInfluencerDashboard) {
    return <InfluencerDashboard onBack={() => { setShowInfluencerDashboard(false); onRestaurantEdited?.(); }} />;
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-none bg-white dark:bg-gray-900 md:px-6 lg:px-8">
      {/* Profile header */}
      <div className="pt-12 pb-6 text-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
        {/* Avatar with gradient ring */}
        <div className="flex flex-col items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleProfilePhotoUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative"
            disabled={uploadingPhoto}
          >
            <div className="w-[88px] h-[88px] rounded-full bg-gradient-to-br from-orange-400 to-orange-500 p-[3px]">
              <div className="w-full h-full rounded-full bg-white dark:bg-gray-900 p-[3px]">
                {profileImage ? (
                  <img src={profileImage} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-4xl">
                    {profileIcon}
                  </div>
                )}
              </div>
            </div>
            {uploadingPhoto && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <span className="text-white text-xs font-medium">...</span>
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white dark:bg-gray-700 border-2 border-white dark:border-gray-900 flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-300"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </div>
          </button>

          {editingNickname ? (
            <div className="flex flex-col items-center gap-2 mt-3">
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                className="text-center text-lg font-bold border-b-2 border-gray-900 dark:border-white outline-none bg-transparent w-40 text-gray-900 dark:text-white"
                autoFocus
                maxLength={50}
              />
              {nicknameError && <p className="text-red-500 text-xs">{nicknameError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveNickname} className="text-xs px-3 py-1 bg-orange-500 text-white rounded-full">保存</button>
                <button onClick={() => setEditingNickname(false)} className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-full">キャンセル</button>
              </div>
            </div>
          ) : (
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-3">
              {user?.nickname ?? 'ユーザー'}
            </p>
          )}
          <p className="text-[13px] text-gray-400 mt-1">{user?.email}</p>

          {/* Edit profile / Edit spots / Share — 3 button row (iOS parity) */}
          <div className="flex gap-2 mt-4 px-8 max-w-md mx-auto">
            <button
              onClick={() => { setNicknameInput(user?.nickname ?? ''); setEditingNickname(true); }}
              className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800 text-[12px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform truncate"
            >
              {t('account.editProfile')}
            </button>
            {uploadStatus === 'approved' && (
              <button
                onClick={() => setShowInfluencerDashboard(true)}
                className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800 text-[12px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform truncate"
              >
                {t('account.editSpots')}
              </button>
            )}
            <button
              onClick={async () => {
                const url = `https://soybeans02.github.io/stoguru/u/${user?.userId ?? ''}`;
                try {
                  if (navigator.share) {
                    await navigator.share({ title: 'stoguru', url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    alert(t('account.profileShareCopied'));
                  }
                } catch {
                  /* user cancelled */
                }
              }}
              className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800 text-[12px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform truncate"
            >
              {t('account.share')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 mt-5">
          <button onClick={() => setListPanel('stocks')} className="text-center" aria-label={t('account.saved')}>
            <p className="text-[22px] font-extrabold text-gray-900 dark:text-white">{safeStocks.length}</p>
            <p className="text-[11px] text-gray-400">{t('account.saved')}</p>
          </button>
          <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch" />
          <button onClick={() => setListPanel('visited')} className="text-center" aria-label={t('account.visited')}>
            <p className="text-[22px] font-extrabold text-gray-900 dark:text-white">{visitedCount}</p>
            <p className="text-[11px] text-gray-400">{t('account.visited')}</p>
          </button>
          <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch" />
          <button onClick={() => setListPanel('following')} className="text-center" aria-label={t('account.following')}>
            <p className="text-[22px] font-extrabold text-gray-900 dark:text-white">{followingCount}</p>
            <p className="text-[11px] text-gray-400">{t('account.following')}</p>
          </button>
          <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch" />
          <button onClick={() => setListPanel('followers')} className="text-center" aria-label={t('account.followers')}>
            <p className="text-[22px] font-extrabold text-gray-900 dark:text-white">{followersCount}</p>
            <p className="text-[11px] text-gray-400">{t('account.followers')}</p>
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 md:max-w-lg md:mx-auto">
        {/* Influencer banner — uploadStatus に応じて出し分け */}
        <div className="mt-2 mb-5">
          {uploadStatusLoading ? (
            <div className="w-full px-4 py-3.5 bg-gray-100 dark:bg-gray-800 rounded-[14px] flex items-center justify-center">
              <p className="text-[13px] text-gray-400">...</p>
            </div>
          ) : uploadStatus === 'approved' ? (
            <button
              onClick={() => setShowInfluencerDashboard(true)}
              className="w-full px-4 py-3.5 bg-orange-500 hover:bg-orange-600 rounded-[14px] flex items-center justify-between active:scale-[0.98] transition-all"
            >
              <p className="text-[13px] font-bold text-white">{t('account.editSpots')}</p>
              <span className="text-white/40 text-lg">›</span>
            </button>
          ) : uploadStatus === 'pending' ? (
            <button
              disabled
              className="w-full px-4 py-3.5 bg-gray-200 dark:bg-gray-700 rounded-[14px] flex items-center justify-between cursor-not-allowed opacity-90"
            >
              <p className="text-[13px] font-bold text-gray-500 dark:text-gray-300">{t('account.pendingReview')}</p>
              <span className="text-gray-400 text-lg">…</span>
            </button>
          ) : uploadStatus === 'rejected' ? (
            <div className="w-full px-4 py-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-[14px] flex items-center justify-between">
              <p className="text-[13px] font-bold text-red-500">{t('account.applicationRejected')}</p>
            </div>
          ) : (
            <button
              onClick={handleApplyToPost}
              disabled={applyingUpload}
              className="w-full px-4 py-3.5 bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 rounded-[14px] flex items-center justify-between active:scale-[0.98] transition-all disabled:opacity-60"
            >
              <p className="text-[13px] font-bold text-white">{applyingUpload ? '...' : t('account.applyToPost')}</p>
              <span className="text-white/40 text-lg">›</span>
            </button>
          )}
        </div>

        {/* Settings section */}
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 pl-1">{t('account.settings')}</p>
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50 dark:border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-gray-500 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div>
                  <span className="text-[14px] text-gray-700 dark:text-gray-200">{t('account.privateAccount')}</span>
                  <p className="text-[11px] text-gray-400 mt-0.5">{t('account.privateAccountHint')}</p>
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
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-orange-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg></div>}
              label={t('account.theme')}
              value={t(`account.theme${theme === 'white' ? 'White' : theme === 'black' ? 'Black' : theme === 'wood' ? 'Wood' : 'Auto'}`)}
              onClick={() => setPanel('theme')}
              border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-blue-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>}
              label={t('account.language')}
              value={language === 'ja' ? '日本語' : 'English'}
              onClick={() => setPanel('language')}
              border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-amber-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>}
              label={t('account.changePassword')} onClick={() => setPanel('password')} border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-emerald-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>}
              label={t('account.changeEmail')} onClick={() => setPanel('email')}
            />
          </div>
        </div>

        {/* Support section */}
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 pl-1">{t('account.support')}</p>
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-100 dark:border-gray-700 overflow-hidden">
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-purple-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></div>}
              label={t('account.howToUse')} onClick={() => setPanel('howto')} border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-pink-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>}
              label={t('account.feedback')} onClick={() => setPanel('feedback')} border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-orange-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>}
              label={t('account.contactUs')} onClick={() => setPanel('support')} border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-gray-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><circle cx="12" cy="16" r="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>}
              label={t('account.privacyPolicy')} onClick={() => setPanel('privacy')} border
            />
            <MenuItemCard
              icon={<div className="w-8 h-8 rounded-[8px] bg-slate-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>}
              label={t('account.termsOfService')} onClick={() => setPanel('terms')}
            />
          </div>
        </div>

        {/* Danger section */}
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 pl-1">{t('account.other')}</p>
          <div className="bg-white dark:bg-gray-800 rounded-[14px] border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setPanel('deleteAccount')}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-gray-700/50"
            >
              <div className="w-8 h-8 rounded-[8px] bg-red-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </div>
              <span className="text-[14px] text-red-500">{t('account.deleteAccount')}</span>
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3.5"
            >
              <div className="w-8 h-8 rounded-[8px] bg-gray-900 dark:bg-gray-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              </div>
              <span className="text-[14px] text-gray-700 dark:text-gray-300">{t('auth.logOut')}</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-300 dark:text-gray-600 mt-6">ストグル v1.0</p>
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

function MenuItemCard({ icon, label, value, onClick, border }: { icon: React.ReactNode; label: string; value?: string; onClick: () => void; border?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3.5 ${border ? 'border-b border-gray-50 dark:border-gray-700/50' : ''}`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-[14px] text-gray-700 dark:text-gray-200">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {value && <span className="text-[12px] text-gray-400 dark:text-gray-500">{value}</span>}
        <span className="text-gray-300 dark:text-gray-600 text-base">›</span>
      </div>
    </button>
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
