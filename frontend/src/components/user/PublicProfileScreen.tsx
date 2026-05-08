import { useEffect, useState } from 'react';
import * as api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { AuthModal } from '../auth/AuthModal';
import { navigate, goBack } from '../../utils/navigate';
import { FooterStrip } from '../feature/FeatureArticleScreen';
import { safeHttpUrl } from '../../utils/safeUrl';
import { localizeGenre, localizeTag, localizeProperNoun, localizePriceRange, localizeFreeText } from '../../utils/labelI18n';

interface PublicProfile {
  influencerId: string;
  displayName: string;
  bio?: string;
  instagramHandle?: string;
  instagramUrl?: string;
  tiktokHandle?: string;
  tiktokUrl?: string;
  youtubeHandle?: string;
  youtubeUrl?: string;
  profilePhotoUrl?: string;
  genres?: string[];
  isVerified?: boolean;
}

interface PublicRestaurant {
  restaurantId: string;
  influencerId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  genres?: string[];
  priceRange?: string;
  photoUrls?: string[];
  urls?: string[];
  description?: string;
  visibility?: string;
  createdAt?: number;
}

interface Props {
  userId: string;
}

const FALLBACK_PHOTOS = [
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=300',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=300',
  'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=300',
];

function fallbackFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return FALLBACK_PHOTOS[Math.abs(h) % FALLBACK_PHOTOS.length];
}

export function PublicProfileScreen({ userId }: Props) {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const isAnonymous = !user;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [restaurants, setRestaurants] = useState<PublicRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      api.getPublicInfluencerProfile(userId).catch(() => null),
      api.getPublicInfluencerRestaurants(userId).catch(() => []),
    ]).then(([p, rs]) => {
      if (cancelled) return;
      if (!p) { setNotFound(true); setLoading(false); return; }
      setProfile(p as PublicProfile);
      setRestaurants((rs || []) as PublicRestaurant[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const goHome = () => navigate('/');

  return (
    <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)]">
      {/* Top nav */}
      <nav
        className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--border)]"
        style={{ background: 'color-mix(in srgb, var(--header-bg) 88%, transparent)' }}
      >
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4 sm:gap-5">
          {/* 戻るボタン */}
          <button
            onClick={goBack}
            aria-label={t('common.back')}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border-strong)] bg-[var(--card-bg)] hover:bg-[var(--bg-soft)] transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <button
            onClick={goHome}
            className="text-[20px] sm:text-[22px] font-extrabold tracking-[-0.02em]"
            style={{
              background:
                'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            stoguru
          </button>
          <div className="ml-auto flex items-center gap-2">
            {isAnonymous ? (
              <>
                <button
                  onClick={() => setAuthModal('login')}
                  className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2"
                >
                  {t('auth.logIn')}
                </button>
                <button
                  onClick={() => setAuthModal('signup')}
                  className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
                  style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
                >
                  {t('home.ctaSignUp')}
                </button>
              </>
            ) : (
              <button
                onClick={goHome}
                className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2"
              >
                {t('tabs.home')}
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        {loading ? (
          <div className="py-20 text-center text-[var(--text-tertiary)] text-sm">{t('common.loading')}</div>
        ) : notFound ? (
          <div className="py-20 text-center">
            <p className="text-[18px] font-bold mb-2">{t('publicProfile.notFound')}</p>
            <p className="text-[13px] text-[var(--text-secondary)]">{t('publicProfile.notFoundHint')}</p>
            <button
              onClick={goHome}
              className="mt-6 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent-orange)' }}
            >
              {t('publicProfile.backToHome')}
            </button>
          </div>
        ) : profile && (
          <>
            {/* Profile header card */}
            <div className="relative rounded-[var(--radius-2xl)] overflow-hidden border border-[var(--border)] bg-[var(--card-bg)] shadow-[var(--shadow-md)] mb-6">
              <div
                className="h-[120px] sm:h-[150px]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                }}
              />
              <div className="px-6 sm:px-8 pb-6 -mt-12 sm:-mt-14">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                    <div
                      className="w-[96px] h-[96px] sm:w-[112px] sm:h-[112px] rounded-full p-[3px] shadow-[var(--shadow-lg)] shrink-0"
                      style={{ background: 'var(--card-bg)' }}
                    >
                      <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-soft)]">
                        {profile.profilePhotoUrl ? (
                          <img src={profile.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[44px]">🍕</div>
                        )}
                      </div>
                    </div>
                    <div className="sm:pb-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-[-0.02em] truncate">
                          {profile.displayName ? localizeProperNoun(profile.displayName, language) : t('publicProfile.userFallback')}
                        </h1>
                        {profile.isVerified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'var(--accent-blue)' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                            {t('publicProfile.verified')}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">{restaurants.length} spots</p>
                    </div>
                  </div>
                </div>
                {profile.bio && (
                  <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mt-4 max-w-[600px]">{profile.bio}</p>
                )}
                {(profile.instagramUrl || profile.tiktokUrl || profile.youtubeUrl) && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {profile.instagramUrl && (
                      <SocialLink url={profile.instagramUrl} label="Instagram" handle={profile.instagramHandle} />
                    )}
                    {profile.tiktokUrl && (
                      <SocialLink url={profile.tiktokUrl} label="TikTok" handle={profile.tiktokHandle} />
                    )}
                    {profile.youtubeUrl && (
                      <SocialLink url={profile.youtubeUrl} label="YouTube" handle={profile.youtubeHandle} />
                    )}
                  </div>
                )}
                {profile.genres && profile.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {profile.genres.map((g) => (
                      <span
                        key={g}
                        className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                        style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}
                      >
                        {localizeGenre(g, language)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Restaurants list */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-[20px] sm:text-[22px] font-extrabold tracking-[-0.015em]">{t('publicProfile.postsTitle')}</h2>
                <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">{restaurants.length} {t('publicProfile.countSuffix')}</p>
              </div>
            </div>

            {restaurants.length === 0 ? (
              <div className="py-16 text-center text-[var(--text-tertiary)] text-sm bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)]">
                {t('publicProfile.noPosts')}
              </div>
            ) : (
              <div className="space-y-3">
                {restaurants.map((r) => (
                  <RichRestaurantCard key={r.restaurantId} restaurant={r} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <FooterStrip />

      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
    </div>
  );
}

function SocialLink({ url, label, handle }: { url: string; label: string; handle?: string }) {
  // url が javascript: 等の悪意あるスキームならリンク化せず無効化
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full bg-[var(--bg-soft)] hover:bg-[var(--card-bg-soft)] border border-[var(--border)] transition-colors"
    >
      <span className="text-[var(--text-secondary)]">{label}</span>
      {handle && <span className="text-[var(--text-primary)]">{handle.startsWith('@') ? handle : `@${handle}`}</span>}
    </a>
  );
}

/* ─────────────────────────────────────
   食べログ風 横長リッチカード
   ───────────────────────────────────── */
function RichRestaurantCard({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t, language } = useTranslation();
  const photos = restaurant.photoUrls && restaurant.photoUrls.length > 0
    ? restaurant.photoUrls
    : [fallbackFor(restaurant.restaurantId)];
  const main = photos[0];
  const thumbs = photos.slice(1, 5);
  const genre = restaurant.genres?.[0];

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-0">
        {/* Photos column (sm+) */}
        <div className="hidden sm:flex flex-col gap-1 p-2 bg-[var(--bg-soft)]">
          <div className="flex-1 aspect-[4/3] rounded-[var(--radius-md)] overflow-hidden">
            <img
              src={main}
              alt={restaurant.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackFor(restaurant.restaurantId); }}
            />
          </div>
          {thumbs.length > 0 && (
            <div className="grid grid-cols-4 gap-1 h-[58px]">
              {thumbs.map((p, i) => (
                <div key={i} className="rounded-[var(--radius-sm)] overflow-hidden">
                  <img loading="lazy" src={p} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="rounded-[var(--radius-sm)] bg-[var(--card-bg-soft)]" />
              ))}
            </div>
          )}
        </div>

        {/* Mobile photo (sm-) */}
        <div className="block sm:hidden aspect-[16/9] overflow-hidden">
          <img
            src={main}
            alt={restaurant.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackFor(restaurant.restaurantId); }}
          />
        </div>

        {/* Info column */}
        <div className="p-4 sm:p-5 flex flex-col">
          <h3 className="text-[16px] sm:text-[17px] font-bold tracking-[-0.01em] mb-1.5">{localizeProperNoun(restaurant.name, language)}</h3>

          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] mb-2 flex-wrap">
            {restaurant.address && <span>{localizeProperNoun(restaurant.address, language)}</span>}
            {restaurant.address && (genre || restaurant.priceRange) && <span className="opacity-50">·</span>}
            {genre && <span>{localizeGenre(genre, language)}</span>}
            {genre && restaurant.priceRange && <span className="opacity-50">·</span>}
            {restaurant.priceRange && <span>{localizePriceRange(restaurant.priceRange, language)}</span>}
          </div>

          {restaurant.description && (
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-2">
              {localizeFreeText(restaurant.description, language)}
            </p>
          )}

          {restaurant.genres && restaurant.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {restaurant.genres.slice(0, 4).map((g, i) => (
                <span
                  key={i}
                  className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}
                >
                  {localizeTag(g, language)}
                </span>
              ))}
            </div>
          )}

          {/* Footer: external links */}
          {restaurant.urls && restaurant.urls.length > 0 && (
            <div className="mt-auto pt-2 border-t border-[var(--border)] flex flex-wrap gap-2">
              {restaurant.urls.slice(0, 3).map((u, i) => {
                const host = (() => { try { return new URL(u).hostname.replace('www.', ''); } catch { return t('publicProfile.linkFallback'); } })();
                return (
                  <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    {host}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
