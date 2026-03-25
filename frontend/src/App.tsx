import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { RestaurantProvider } from './context/RestaurantContext';
import * as api from './utils/api';
import { AuthScreen } from './components/auth/AuthScreen';
import { Header } from './components/layout/Header';
import { MapView } from './components/map/MapView';
import { RestaurantList } from './components/restaurant/RestaurantList';
import { KeepView } from './components/keep/KeepView';
import { RestaurantModal } from './components/restaurant/RestaurantModal';
import { RestaurantForm } from './components/restaurant/RestaurantForm';
import { ReviewModal } from './components/restaurant/ReviewModal';
import { UserProfileModal } from './components/user/UserProfileModal';
import { MessageView } from './components/message/MessageView';
import type { Restaurant } from './types/restaurant';

type Tab = 'map' | 'list' | 'keep';

function MainApp() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('map');
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);
  const [editRestaurant, setEditRestaurant] = useState<Restaurant | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewRestaurant, setReviewRestaurant] = useState<Restaurant | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [panToLocation, setPanToLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);

  // 会話データをキャッシュ（常にバックグラウンドで更新）
  const [cachedConversations, setCachedConversations] = useState<api.Conversation[]>([]);
  const [cachedNicknames, setCachedNicknames] = useState<Record<string, string>>({});
  const nicknamesFetchedRef = useRef<Set<string>>(new Set());

  const refreshConversations = useCallback(async () => {
    try {
      const convs = await api.getConversations();
      setCachedConversations(convs);
      // 未取得のニックネームだけfetch
      const myId = user?.userId ?? '';
      for (const c of convs) {
        const otherId = c.user1 === myId ? c.user2 : c.user1;
        if (!nicknamesFetchedRef.current.has(otherId)) {
          nicknamesFetchedRef.current.add(otherId);
          api.getUserProfile(otherId).then((p) => {
            setCachedNicknames((prev) => ({ ...prev, [otherId]: p.nickname }));
          }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }, [user?.userId]);

  // 初回 + 10秒ごとにバックグラウンド更新
  useEffect(() => {
    refreshConversations();
    const interval = setInterval(refreshConversations, 10000);
    return () => clearInterval(interval);
  }, [refreshConversations]);

  function handleJumpToMap(lat: number, lng: number) {
    setPanToLocation({ lat, lng });
    setTab('map');
  }
  function handleQuickAdd(name: string, lat: number, lng: number) {
    // マップ検索から直接編集フォームで追加
    const now = new Date().toISOString();
    setEditRestaurant({
      id: '', name, address: '', lat, lng,
      categoryIds: [], influencerIds: [], sourceVideos: [],
      notes: '', review: null, status: 'wishlist',
      visitedAt: null, createdAt: now, updatedAt: now,
    });
    setEditOpen(true);
  }

  function openEdit(r: Restaurant) {
    setEditRestaurant(r);
    setEditOpen(true);
  }
  function openReview(r: Restaurant) {
    setReviewRestaurant(r);
  }

  // メッセージ未読カウント計算
  const msgUnreadCount = cachedConversations.filter((c) => {
    const myId = user?.userId;
    if (c.status === 'pending' && c.requestedBy !== myId) return true;
    if (c.status === 'accepted' && c.lastMessage) {
      const myLastRead = c.user1 === myId ? (c.user1LastRead ?? 0) : (c.user2LastRead ?? 0);
      return c.lastMessageAt > myLastRead;
    }
    return false;
  }).length;

  return (
    <RestaurantProvider>
      <div className="flex flex-col min-h-svh bg-gray-50 max-w-xl mx-auto overflow-x-hidden">
        <Header activeTab={tab} onTabChange={setTab} onOpenProfile={setProfileUserId} onJumpToMap={handleJumpToMap} onOpenMessage={() => setMessageOpen(true)} messageCount={msgUnreadCount} />
        <main className="flex-1 flex flex-col pt-[104px]">
          <div style={{ display: tab === 'map' ? 'flex' : 'none' }} className="flex-1 flex flex-col">
            <MapView onDetail={setDetailRestaurant} onReview={openReview} onQuickAdd={handleQuickAdd} panTo={panToLocation} onPanComplete={() => setPanToLocation(null)} />
          </div>
          <div style={{ display: tab === 'list' ? 'block' : 'none' }}>
            <RestaurantList
              onEdit={openEdit}
              onDetail={setDetailRestaurant}
              onReview={openReview}
              onJumpToMap={handleJumpToMap}
            />
          </div>
          <div style={{ display: tab === 'keep' ? 'block' : 'none' }}>
            <KeepView onDetail={setDetailRestaurant} onOpenProfile={setProfileUserId} onOpenMessage={(targetId) => { setMessageTargetId(targetId); setMessageOpen(true); }} />
          </div>
        </main>

        <RestaurantModal
          restaurant={detailRestaurant}
          onClose={() => setDetailRestaurant(null)}
          onEdit={openEdit}
          onReview={openReview}
        />
        <RestaurantForm
          restaurant={editRestaurant}
          isOpen={editOpen}
          onClose={() => { setEditOpen(false); setEditRestaurant(null); }}
        />
        <ReviewModal
          restaurant={reviewRestaurant}
          onClose={() => setReviewRestaurant(null)}
        />
        <UserProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onOpenMessage={(targetId) => {
            setProfileUserId(null);
            setMessageTargetId(targetId);
            setMessageOpen(true);
          }}
        />
        {messageOpen && (
          <MessageView
            onClose={() => { setMessageOpen(false); setMessageTargetId(null); }}
            initialTargetId={messageTargetId}
            cachedConversations={cachedConversations}
            cachedNicknames={cachedNicknames}
            onConversationsChanged={refreshConversations}
          />
        )}
      </div>
    </RestaurantProvider>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return <MainApp />;
}
