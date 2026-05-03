import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { useTranslation } from '../../context/LanguageContext';
import * as api from '../../utils/api';

interface Props {
  /**
   * "support" ならカテゴリ固定 (replyEmail UI を出す)。
   * "general" なら bug/feature/other を選べる。
   */
  category: 'general' | 'support';
  onClose: () => void;
}

export function FeedbackSheet({ category, onClose }: Props) {
  const { t } = useTranslation();
  const [feedbackCategory, setFeedbackCategory] = useState<api.FeedbackCategory>(
    category === 'support' ? 'support' : 'other',
  );
  const [message, setMessage] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.submitFeedback({
        message: message.trim(),
        category: feedbackCategory,
        replyEmail: replyEmail.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSending(false);
    }
  }

  const title = category === 'support' ? t('account.contactUs') : t('account.feedback');

  return (
    <Sheet isOpen onClose={onClose} title={title}>
      {sent ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-500 flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-primary)] mb-4">{t('feedback.sent')}</p>
          <Button onClick={onClose} variant="primary" size="md">{t('common.close')}</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {category !== 'support' && (
            <div>
              <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">{t('feedback.title')}</p>
              <div className="flex flex-wrap gap-2">
                {(['bug', 'feature', 'other'] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setFeedbackCategory(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      feedbackCategory === c
                        ? 'bg-[var(--accent-orange)] text-[var(--text-on-accent)]'
                        : 'bg-[var(--card-bg-soft)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    {t(`feedback.${c}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder={t('feedback.placeholder')}
              maxLength={2000}
              className="w-full rounded-[12px] bg-[var(--card-bg-soft)] text-[var(--text-primary)] px-3 py-2.5 outline-none border border-[var(--border)] focus:border-[var(--accent-orange)] text-sm resize-none placeholder:text-[var(--text-tertiary)]"
            />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 text-right">{message.length}/2000</p>
          </div>

          {category === 'support' && (
            <div>
              <label className="block text-[12px] text-[var(--text-secondary)] mb-1">
                {t('feedback.replyEmailLabel')}
              </label>
              <input
                type="email"
                value={replyEmail}
                onChange={(e) => setReplyEmail(e.target.value)}
                placeholder="mail@example.com"
                className="w-full rounded-[12px] bg-[var(--card-bg-soft)] text-[var(--text-primary)] px-3 py-2.5 outline-none border border-[var(--border)] focus:border-[var(--accent-orange)] text-sm placeholder:text-[var(--text-tertiary)]"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            disabled={sending || !message.trim()}
          >
            {sending ? '...' : t('feedback.submit')}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
