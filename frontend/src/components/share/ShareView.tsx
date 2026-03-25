import { useState, useEffect } from 'react';
import { MapPin, Trash2, Navigation } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';

interface Props {
  onOpenProfile?: (userId: string) => void;
  onJumpToMap?: (lat: number, lng: number) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(ts).toLocaleDateString('ja-JP');
}

export function ShareView({ onOpenProfile, onJumpToMap }: Props) {
  const { user } = useAuth();
  const [feed, setFeed] = useState<api.ShareItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSharesFeed().then((items) => {
      setFeed(items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(createdAt: number) {
    await api.deleteSharePost(createdAt);
    setFeed((prev) => prev.filter((s) => s.createdAt !== createdAt));
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      <div className="px-4 py-3 border-b bg-white">
        <h2 className="text-base font-semibold text-gray-900">シェア</h2>
        <p className="text-xs text-gray-400 mt-0.5">フォロー中の人の行きたいお店</p>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">読み込み中...</p>
      ) : feed.length === 0 ? (
        <div className="text-center py-16 px-4">
          <MapPin size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">まだシェアがありません</p>
          <p className="text-gray-400 text-xs mt-1">レストランを保存するときに「シェアする」をONにすると、フォロワーのフィードに表示されます</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {feed.map((item) => (
            <div key={item.shareId} className="px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-3">
                {/* アバター */}
                <button
                  onClick={() => onOpenProfile?.(item.userId)}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center text-white text-sm font-bold shrink-0"
                >
                  {item.userNickname.charAt(0)}
                </button>

                <div className="flex-1 min-w-0">
                  {/* ヘッダー */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenProfile?.(item.userId)}
                      className="text-sm font-semibold text-gray-900 hover:underline"
                    >
                      {item.userNickname}
                    </button>
                    <span className="text-xs text-gray-400">{timeAgo(item.createdAt)}</span>
                  </div>

                  {/* コンテンツ */}
                  <div className="mt-1.5 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-orange-500 shrink-0" />
                      <span className="text-sm font-medium text-gray-800">{item.restaurantName}</span>
                    </div>
                    {item.restaurantAddress && (
                      <p className="text-xs text-gray-500 mt-0.5 ml-5">{item.restaurantAddress}</p>
                    )}
                    {item.comment && (
                      <p className="text-sm text-gray-700 mt-1.5">{item.comment}</p>
                    )}
                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-3 mt-2">
                    {item.lat && item.lng && (
                      <button
                        onClick={() => onJumpToMap?.(item.lat!, item.lng!)}
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                      >
                        <Navigation size={12} /> マップで見る
                      </button>
                    )}
                    {item.userId === user?.userId && (
                      <button
                        onClick={() => handleDelete(item.createdAt)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={12} /> 削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
