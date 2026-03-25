import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';

interface Props {
  onClose: () => void;
  initialTargetId?: string | null;
  cachedConversations?: api.Conversation[];
  cachedNicknames?: Record<string, string>;
  onConversationsChanged?: () => void;
}

// メッセージキャッシュ（コンポーネント外に保持して再マウントでも維持）
const msgCache: Record<string, { messages: api.Message[]; status: string | null; requestedBy?: string }> = {};

export function MessageView({ onClose, initialTargetId, cachedConversations, cachedNicknames, onConversationsChanged }: Props) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<api.Conversation[]>(cachedConversations ?? []);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(initialTargetId ?? null);
  const [messages, setMessages] = useState<api.Message[]>([]);
  const [convStatus, setConvStatus] = useState<string | null>(null);
  const [requestedBy, setRequestedBy] = useState<string | undefined>();
  const [otherLastRead, setOtherLastRead] = useState(0);
  const [input, setInput] = useState('');
  const [nicknames, setNicknames] = useState<Record<string, string>>(cachedNicknames ?? {});
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMsgCountRef = useRef(0);
  const nicknamesFetchedRef = useRef<Set<string>>(new Set());
  const myId = user?.userId ?? '';

  // キャッシュが更新されたら反映
  useEffect(() => {
    if (cachedConversations) setConversations(cachedConversations);
  }, [cachedConversations]);

  useEffect(() => {
    if (cachedNicknames) setNicknames((prev) => ({ ...prev, ...cachedNicknames }));
  }, [cachedNicknames]);

  // 会話一覧を5秒ポーリング（変更時のみ更新）
  useEffect(() => {
    let cancelled = false;
    let prevJson = JSON.stringify(cachedConversations ?? []);

    async function fetchConvs() {
      try {
        const data = await api.getConversations();
        if (cancelled) return;
        const json = JSON.stringify(data);
        if (json !== prevJson) {
          prevJson = json;
          setConversations(data);
          onConversationsChanged?.();
        }
      } catch { /* ignore */ }
    }
    const interval = setInterval(fetchConvs, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [cachedConversations, onConversationsChanged]);

  // ニックネーム取得（未取得のもののみ）
  useEffect(() => {
    conversations.forEach((c) => {
      const otherId = c.user1 === myId ? c.user2 : c.user1;
      if (!nicknamesFetchedRef.current.has(otherId) && !nicknames[otherId]) {
        nicknamesFetchedRef.current.add(otherId);
        api.getUserProfile(otherId).then((p) => {
          setNicknames((prev) => ({ ...prev, [otherId]: p.nickname }));
        }).catch(() => {});
      }
    });
  }, [conversations, myId, nicknames]);

  // チャット切り替え時にキャッシュから即表示 + 裏で最新を取得
  useEffect(() => {
    if (!selectedTarget) {
      setMessages([]);
      setConvStatus(null);
      setRequestedBy(undefined);
      return;
    }

    const target: string = selectedTarget;
    // キャッシュがあれば即座にセット
    const cached = msgCache[target];
    if (cached) {
      setMessages(cached.messages);
      setConvStatus(cached.status);
      setRequestedBy(cached.requestedBy);
      lastMsgCountRef.current = cached.messages.length;
    } else {
      setMessages([]);
      setConvStatus(null);
      setRequestedBy(undefined);
    }

    let cancelled = false;
    let prevLen = cached?.messages.length ?? 0;
    let prevLast = cached?.messages.length ? cached.messages[cached.messages.length - 1].createdAt : 0;
    let isFirst = true;

    async function fetchMessages() {
      try {
        const data = await api.getMessagesWithUser(target, !isFirst);
        isFirst = false;
        if (cancelled) return;
        const msgs = data.messages;
        const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].createdAt : 0;
        // 相手のlastReadを更新
        if (data.user1 && data.user2) {
          const otherRead = data.user1 === myId ? (data.user2LastRead ?? 0) : (data.user1LastRead ?? 0);
          setOtherLastRead(otherRead);
        }
        if (msgs.length !== prevLen || lastTs !== prevLast) {
          prevLen = msgs.length;
          prevLast = lastTs;
          setMessages(msgs);
          setConvStatus(data.status);
          setRequestedBy(data.requestedBy);
          // キャッシュ更新
          msgCache[target] = { messages: msgs, status: data.status, requestedBy: data.requestedBy };
        }
      } catch { /* ignore */ }
    }

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);

    // ニックネーム取得
    if (!nicknamesFetchedRef.current.has(target) && !nicknames[target]) {
      nicknamesFetchedRef.current.add(target);
      api.getUserProfile(target).then((p) => {
        if (!cancelled) setNicknames((prev) => ({ ...prev, [target]: p.nickname }));
      }).catch(() => {});
    }

    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedTarget]);

  // 新着メッセージがある時だけスクロール
  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastMsgCountRef.current = messages.length;
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedTarget) return;
    const text = input.trim();
    setInput('');
    // 楽観的にメッセージを即追加
    const optimisticMsg: api.Message = {
      conversationId: '', createdAt: Date.now(), senderId: myId, content: text, read: false,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      await api.sendMessageTo(selectedTarget, text);
      const data = await api.getMessagesWithUser(selectedTarget);
      setMessages(data.messages);
      setConvStatus(data.status);
      msgCache[selectedTarget] = { messages: data.messages, status: data.status, requestedBy: data.requestedBy };
      onConversationsChanged?.();
    } catch { /* ignore */ }
  }, [input, selectedTarget, myId, onConversationsChanged]);

  async function handleAccept() {
    if (!selectedTarget) return;
    await api.acceptMessageRequest(selectedTarget);
    setConvStatus('accepted');
    onConversationsChanged?.();
  }

  async function handleReject() {
    if (!selectedTarget) return;
    await api.rejectMessageRequest(selectedTarget);
    setConvStatus('rejected');
    onConversationsChanged?.();
  }

  function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return '今';
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    return `${Math.floor(hr / 24)}日前`;
  }

  const isPendingForMe = convStatus === 'pending' && requestedBy !== myId;
  // 入力欄を表示: 新規(null)、承認済み、自分が送ったpending
  const canSend = convStatus === null || convStatus === 'accepted' || (convStatus === 'pending' && requestedBy === myId);

  const requests = conversations
    .filter((c) => c.status === 'pending' && c.requestedBy !== myId)
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const accepted = conversations
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  // チャット画面
  if (selectedTarget) {
    const targetName = nicknames[selectedTarget] ?? '...';
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <header className="flex items-center gap-3 px-4 py-3 border-b bg-white">
          <button onClick={() => setSelectedTarget(null)} className="text-gray-500 hover:text-gray-800">
            <ArrowLeft size={22} />
          </button>
          <span className="font-semibold">{targetName}</span>
        </header>

        {/* メッセージリクエスト承認バー */}
        {isPendingForMe && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-yellow-800">{targetName}からのメッセージリクエスト</span>
            <div className="flex gap-2">
              <button onClick={handleAccept} className="bg-blue-500 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1">
                <Check size={14} /> 承認
              </button>
              <button onClick={handleReject} className="bg-gray-300 text-gray-700 text-xs px-3 py-1 rounded-full flex items-center gap-1">
                <X size={14} /> 拒否
              </button>
            </div>
          </div>
        )}

        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
          {messages.length === 0 && canSend && (
            <p className="text-center text-gray-400 text-sm py-8">メッセージを送ってみましょう</p>
          )}
          {(() => {
            // 最後のメッセージが自分のもので、相手が既読なら「既読」を表示
            const lastMsg = messages[messages.length - 1];
            const showReadOnLast = lastMsg
              && lastMsg.senderId === myId
              && lastMsg.createdAt <= otherLastRead;

            return messages.map((m, i) => {
              const isMine = m.senderId === myId;
              const showRead = isMine && showReadOnLast && i === messages.length - 1;
              return (
                <div key={`${m.createdAt}-${i}`} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    isMine
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
                  }`}>
                    <p>{m.content}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
                      {timeAgo(m.createdAt)}
                    </p>
                  </div>
                  {showRead && (
                    <span className="text-[10px] text-gray-400 mt-0.5 mr-1">既読</span>
                  )}
                </div>
              );
            });
          })()}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        {canSend && (
          <div className="border-t bg-white px-4 py-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="メッセージを入力..."
              className="flex-1 border rounded-full px-4 py-2 text-sm outline-none focus:border-blue-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </div>
        )}

        {convStatus === 'rejected' && (
          <div className="border-t bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
            このメッセージリクエストは拒否されました
          </div>
        )}
      </div>
    );
  }

  // 会話一覧
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-white">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={22} />
        </button>
        <span className="font-semibold">メッセージ</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* リクエスト */}
        {requests.length > 0 && (
          <div className="border-b">
            <p className="px-4 py-2 text-xs font-medium text-yellow-600 bg-yellow-50">
              メッセージリクエスト ({requests.length})
            </p>
            {requests.map((c) => {
              const otherId = c.user1 === myId ? c.user2 : c.user1;
              return (
                <button
                  key={c.pk}
                  onClick={() => setSelectedTarget(otherId)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-100"
                >
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 font-bold text-sm">
                    {(nicknames[otherId] ?? '?')[0]}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">{nicknames[otherId] ?? '...'}</p>
                    <p className="text-xs text-gray-400 truncate">{c.lastMessage || 'メッセージリクエスト'}</p>
                  </div>
                  <span className="text-[10px] text-gray-400">{timeAgo(c.lastMessageAt)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 承認済み会話 */}
        {accepted.map((c) => {
          const otherId = c.user1 === myId ? c.user2 : c.user1;
          const myLastRead = c.user1 === myId ? (c.user1LastRead ?? 0) : (c.user2LastRead ?? 0);
          const hasUnread = c.lastMessageAt > myLastRead;
          return (
            <button
              key={c.pk}
              onClick={() => setSelectedTarget(otherId)}
              className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-100 ${hasUnread ? 'bg-blue-50/30' : ''}`}
            >
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                {(nicknames[otherId] ?? '?')[0]}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className={`text-sm ${hasUnread ? 'font-bold' : 'font-medium'}`}>{nicknames[otherId] ?? '...'}</p>
                <p className={`text-xs truncate ${hasUnread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{c.lastMessage}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-gray-400">{timeAgo(c.lastMessageAt)}</span>
                {hasUnread && <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
              </div>
            </button>
          );
        })}

        {conversations.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">メッセージはまだありません</p>
        )}
      </div>
    </div>
  );
}
