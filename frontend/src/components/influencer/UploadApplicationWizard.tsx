import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import * as api from '../../utils/api';
import { POPULAR_GENRES, GENRES } from '../../data/mockRestaurants';

/**
 * 投稿申請ウィザード（4 ステップ）。
 *
 * 「お店を編集」を押した未承認ユーザーに表示する。
 * 旧版は単発の「投稿を申請」ボタン → 即 pending だったが、
 * 申請の質を上げるために段階的に情報を集めるフローに置き換え。
 *
 * Steps:
 *   1. イントロ（投稿者として何をやるか / 審査の流れ）
 *   2. プロフィール — 活動エリア / 得意ジャンル
 *   3. サンプル — SNS / 動画 URL（任意 1〜5）+ 投稿したい理由
 *   4. 同意 — ガイドライン同意 + 送信
 */

interface Props {
  /** 過去に申請したことがあれば prefill 用に渡す（rejected の再申請時に活用） */
  initial?: api.UploadApplicationDetail | null;
  onClose: () => void;
  /** 送信完了時に呼ばれる（親側で status 再取得するなど） */
  onSubmitted: (next: api.UploadApplication) => void;
}

const REGION_SUGGESTIONS = [
  '大阪', '東京', '京都', '神戸', '名古屋', '福岡', '札幌', '横浜', '広島', '仙台',
];

type Step = 0 | 1 | 2 | 3;

export function UploadApplicationWizard({ initial, onClose, onSubmitted }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // フォーム状態（`initial` から prefill）
  const [regions, setRegions] = useState<string[]>(initial?.regions?.slice(0, 5) ?? []);
  const [genres, setGenres] = useState<string[]>(initial?.genres?.slice(0, 5) ?? []);
  const [sampleUrls, setSampleUrls] = useState<string[]>(() => {
    const arr = initial?.sampleUrls ? [...initial.sampleUrls] : [];
    while (arr.length < 3) arr.push('');
    return arr.slice(0, 5);
  });
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [agreed, setAgreed] = useState(false);

  // ESC で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totalSteps = 4;
  const progress = ((step + 1) / totalSteps) * 100;

  const stepValid = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return regions.length > 0 && genres.length > 0;
    if (step === 2) {
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 20) return false;
      // sampleUrls はゼロでも許容（任意）。書いた行は http(s) であること。
      return sampleUrls.every((u) => !u.trim() || /^https?:\/\//.test(u.trim()));
    }
    if (step === 3) return agreed;
    return false;
  }, [step, regions, genres, reason, sampleUrls, agreed]);

  function toggle(arr: string[], setArr: (v: string[]) => void, value: string, max = 5) {
    if (arr.includes(value)) setArr(arr.filter((x) => x !== value));
    else if (arr.length < max) setArr([...arr, value]);
  }

  async function handleSubmit() {
    setError('');
    if (!stepValid) return;
    setSubmitting(true);
    try {
      const cleanedSampleUrls = sampleUrls.map((u) => u.trim()).filter(Boolean).slice(0, 5);
      const result = await api.submitUploadApplication({
        reason: reason.trim(),
        regions,
        genres,
        sampleUrls: cleanedSampleUrls,
        agreed: true,
      });
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setError('');
    if (step === 3) { handleSubmit(); return; }
    if (stepValid) setStep((s) => Math.min(3, s + 1) as Step);
  }
  function prev() {
    setError('');
    if (step === 0) onClose();
    else setStep((s) => Math.max(0, s - 1) as Step);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] my-4 rounded-[var(--radius-2xl)] overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]"
        style={{ background: 'var(--card-bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── ヘッダー：プログレスバー + 閉じる ─── */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <button
            onClick={prev}
            aria-label="戻る"
            className="w-9 h-9 grid place-items-center rounded-full border border-[var(--border)] hover:bg-[var(--bg-soft)] transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-tertiary)' }}>
              Step {step + 1} / {totalSteps}
            </div>
            <div className="h-1 bg-[var(--bg-soft)] rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${progress}%`, background: 'var(--accent-orange)' }}
              />
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="w-9 h-9 grid place-items-center rounded-full border border-[var(--border)] hover:bg-[var(--bg-soft)] transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ─── 中身（ステップごと） ─── */}
        <div className="px-5 sm:px-7 pt-2 pb-5" style={{ minHeight: 360 }}>
          {step === 0 && <StepIntro />}
          {step === 1 && (
            <StepProfile
              regions={regions}
              genres={genres}
              onRegionToggle={(r) => toggle(regions, setRegions, r)}
              onGenreToggle={(g) => toggle(genres, setGenres, g)}
            />
          )}
          {step === 2 && (
            <StepSamples
              reason={reason}
              setReason={setReason}
              sampleUrls={sampleUrls}
              setSampleUrls={setSampleUrls}
            />
          )}
          {step === 3 && (
            <StepAgreement agreed={agreed} setAgreed={setAgreed} />
          )}

          {error && (
            <p className="mt-4 text-[12px] font-semibold" style={{ color: '#FF453A' }}>{error}</p>
          )}
        </div>

        {/* ─── 下部アクション ─── */}
        <div className="flex gap-2 px-5 sm:px-7 pb-5">
          <button
            onClick={prev}
            disabled={submitting}
            className="flex-1 h-11 rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            {step === 0 ? 'キャンセル' : '戻る'}
          </button>
          <button
            onClick={next}
            disabled={!stepValid || submitting}
            className="flex-1 h-11 rounded-full text-[13px] font-bold text-white transition-all disabled:opacity-40"
            style={{
              background: 'var(--accent-orange)',
              boxShadow: '0 8px 20px rgba(254,141,40,0.35)',
            }}
          >
            {submitting ? '送信中…' : step === 3 ? t('uploadApply.submit', '申請を送信') : '次へ'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Step 1: イントロ ─────────── */
function StepIntro() {
  return (
    <div>
      <h2 className="font-extrabold tracking-[-0.01em] mb-2" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
        投稿者として始める前に
      </h2>
      <p className="leading-[1.7]" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
        stoguru の投稿者になると、自分のおすすめのお店を地図に追加して、ほかのユーザーに紹介できます。
        申請内容は管理チームが確認してから承認します。
      </p>
      <div className="grid gap-2.5 mt-5">
        {[
          { num: 1, label: '活動エリア / 得意ジャンルを選ぶ' },
          { num: 2, label: '投稿サンプル URL（あれば）と意気込みを書く' },
          { num: 3, label: 'ガイドラインを読んで同意' },
          { num: 4, label: '申請送信 → 管理チームが審査（数日）' },
        ].map((row) => (
          <div
            key={row.num}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: 'var(--bg-soft)' }}
          >
            <span
              className="w-7 h-7 rounded-full grid place-items-center font-bold flex-shrink-0"
              style={{ fontSize: 12, background: 'var(--accent-orange)', color: 'white' }}
            >
              {row.num}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────── Step 2: 活動エリア / 得意ジャンル ─────────── */
function StepProfile({
  regions, genres, onRegionToggle, onGenreToggle,
}: {
  regions: string[];
  genres: string[];
  onRegionToggle: (r: string) => void;
  onGenreToggle: (g: string) => void;
}) {
  // ジャンルは POPULAR_GENRES 8 個 + 残りも候補として表示
  const allGenres = GENRES;
  return (
    <div>
      <h2 className="font-extrabold tracking-[-0.01em] mb-1" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
        あなたの得意分野は？
      </h2>
      <p className="mb-5" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        活動エリアとジャンルをそれぞれ 1〜5 個選んでください。
      </p>

      <div className="text-[11px] uppercase tracking-[0.04em] font-bold mb-2" style={{ color: 'var(--text-tertiary)' }}>
        活動エリア（{regions.length}/5）
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {REGION_SUGGESTIONS.map((r) => {
          const active = regions.includes(r);
          return (
            <button
              key={r}
              onClick={() => onRegionToggle(r)}
              className="px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
              style={{
                background: active ? 'var(--accent-orange)' : 'var(--card-bg)',
                color: active ? 'white' : 'var(--text-primary)',
                border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border)'}`,
              }}
            >
              {r}
            </button>
          );
        })}
      </div>

      <div className="text-[11px] uppercase tracking-[0.04em] font-bold mb-2" style={{ color: 'var(--text-tertiary)' }}>
        得意ジャンル（{genres.length}/5）{genres.length === 0 && <span className="ml-1 normal-case opacity-70 font-medium">— 人気から先に出してます</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* 人気 8 を最初に出す → 残りはコンパクト */}
        {[...POPULAR_GENRES, ...allGenres.filter((g) => !(POPULAR_GENRES as readonly string[]).includes(g))].map((g) => {
          const active = genres.includes(g);
          return (
            <button
              key={g}
              onClick={() => onGenreToggle(g)}
              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
              style={{
                background: active ? 'var(--accent-orange)' : 'var(--card-bg)',
                color: active ? 'white' : 'var(--text-primary)',
                border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border)'}`,
              }}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Step 3: 申請理由 + サンプル URL ─────────── */
function StepSamples({
  reason, setReason, sampleUrls, setSampleUrls,
}: {
  reason: string;
  setReason: (v: string) => void;
  sampleUrls: string[];
  setSampleUrls: (v: string[]) => void;
}) {
  return (
    <div>
      <h2 className="font-extrabold tracking-[-0.01em] mb-1" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
        投稿したい理由とサンプル
      </h2>
      <p className="mb-5" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        どんなお店を投稿したいか、過去に SNS で発信していれば URL を教えてください。
      </p>

      <div className="text-[11px] uppercase tracking-[0.04em] font-bold mb-2" style={{ color: 'var(--text-tertiary)' }}>
        申請理由（20 文字以上 / {reason.trim().length} 文字）
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 1000))}
        rows={4}
        placeholder="例：大阪で月10〜20軒くらい食べ歩いていて、SNSで写真を上げてます。隠れた名店を中心に紹介したいです。"
        className="w-full px-3 py-2.5 rounded-[10px] resize-none outline-none transition-colors"
        style={{
          fontSize: 14,
          background: 'var(--bg-soft)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      />

      <div className="text-[11px] uppercase tracking-[0.04em] font-bold mb-2 mt-5" style={{ color: 'var(--text-tertiary)' }}>
        サンプル URL（任意 / 最大 5 件）
      </div>
      <div className="flex flex-col gap-2">
        {sampleUrls.map((u, i) => (
          <input
            key={i}
            type="url"
            inputMode="url"
            value={u}
            onChange={(e) => {
              const next = [...sampleUrls];
              next[i] = e.target.value;
              setSampleUrls(next);
            }}
            placeholder={i === 0 ? 'https://www.instagram.com/...' : i === 1 ? 'https://www.tiktok.com/@...' : 'https://...'}
            className="px-3 py-2.5 rounded-[10px] outline-none transition-colors"
            style={{
              fontSize: 13,
              background: 'var(--bg-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        ))}
        {sampleUrls.length < 5 && (
          <button
            onClick={() => setSampleUrls([...sampleUrls, ''])}
            className="self-start text-[12px] font-semibold mt-1"
            style={{ color: 'var(--accent-orange)' }}
          >
            + 行を追加
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────── Step 4: ガイドライン同意 ─────────── */
function StepAgreement({
  agreed, setAgreed,
}: {
  agreed: boolean;
  setAgreed: (v: boolean) => void;
}) {
  return (
    <div>
      <h2 className="font-extrabold tracking-[-0.01em] mb-1" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
        投稿ガイドライン
      </h2>
      <p className="mb-4" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        申請を送る前に、以下のルールに目を通してください。
      </p>
      <div
        className="p-4 rounded-2xl mb-4 leading-[1.7]"
        style={{ fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-soft)' }}
      >
        <ul className="list-disc pl-5 space-y-1.5">
          <li>実際に行ったお店だけ投稿する。未訪問のお店や噂だけの紹介は不可。</li>
          <li>他人の写真や記事を無断転載しない。著作権・肖像権を尊重する。</li>
          <li>個人情報・誹謗中傷・差別表現は禁止。</li>
          <li>店名・住所は正確に。閉店していたら投稿を削除する。</li>
          <li>運営の判断で投稿の非公開化や承認取消を行う場合があります。</li>
        </ul>
      </div>
      <label
        className="flex items-start gap-3 px-4 py-3 rounded-2xl cursor-pointer select-none"
        style={{
          background: agreed ? 'rgba(254,141,40,0.1)' : 'var(--bg-soft)',
          border: `1px solid ${agreed ? 'var(--accent-orange)' : 'var(--border)'}`,
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[var(--accent-orange)] flex-shrink-0"
        />
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
          上記のガイドラインを読み、内容に同意します。違反した場合は承認が取り消される可能性があることを理解しました。
        </span>
      </label>
    </div>
  );
}
