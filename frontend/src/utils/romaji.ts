/**
 * 仮名 / 漢字 → ローマ字 ベストエフォート変換。
 *
 * パイプライン:
 *   1. 漢字複合語（KANJI_COMPOUNDS, longest match first）でまず置換
 *   2. 残った仮名（kana）を Hepburn 寄りで音節変換
 *      - っ/ッ → 次子音重ね（っか → kka）
 *      - ー → 直前母音をもう 1 文字（アー → aa）
 *      - 拗音（きゃ / シェ / ファ / ティ 等）は 2 文字テーブル先引き
 *   3. それでも残った 1 字漢字（KANJI_SINGLE）を音読み中心の単表で救済
 *
 * 形態素解析エンジン (kuromoji 等) は ~3MB 級の辞書を持ち込むので不採用。
 * 飲食アプリで実用的な範囲のみ手書きで網羅。未収録の語は素通り。
 * 「無理やり OK」方針 — 多少崩れても EN 寄せを優先。
 */
import { KANJI_COMPOUNDS, KANJI_SINGLE, COMPOUND_KEYS_DESC } from './kanjiDict';

const HIRA: Record<string, string> = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
  'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa',
};

const KATA: Record<string, string> = {
  'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
  'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
  'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
  'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
  'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
  'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
  'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
  'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
  'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
  'ワ': 'wa', 'ヰ': 'i', 'ヱ': 'e', 'ヲ': 'o', 'ン': 'n',
  'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
  'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
  'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
  'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
  'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
  'ァ': 'a', 'ィ': 'i', 'ゥ': 'u', 'ェ': 'e', 'ォ': 'o',
  'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo',
  'ヴ': 'vu',
};

const DIGRAPHS: Record<string, string> = {
  // hiragana
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  // katakana
  'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
  'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho', 'シェ': 'she',
  'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho', 'チェ': 'che',
  'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
  'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
  'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
  'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
  'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
  'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo', 'ジェ': 'je',
  'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
  'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',
  // 外来音 (loanwords) — Hepburn 拡張
  'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo', 'フュ': 'fyu',
  'ヴァ': 'va', 'ヴィ': 'vi', 'ヴェ': 've', 'ヴォ': 'vo', 'ヴュ': 'vyu',
  'ティ': 'ti', 'ディ': 'di', 'トゥ': 'tu', 'ドゥ': 'du', 'デュ': 'dyu',
  'ウィ': 'wi', 'ウェ': 'we', 'ウォ': 'wo',
  'クァ': 'kwa', 'クィ': 'kwi', 'クェ': 'kwe', 'クォ': 'kwo',
  'ツァ': 'tsa', 'ツィ': 'tsi', 'ツェ': 'tse', 'ツォ': 'tso',
};

function isVowel(ch: string): boolean {
  return ch === 'a' || ch === 'i' || ch === 'u' || ch === 'e' || ch === 'o';
}

/**
 * 内部用：漢字複合語マッチ。
 * 入力をスキャンしながら、各位置で「最長一致する複合語キー」が KANJI_COMPOUNDS
 * にあれば差し替える。ヒットしなかった文字は変換せず素通り。
 * 結果は `[token, isReplaced]` の配列で返す（後段の kana 変換に流し込みやすくするため）。
 */
function applyKanjiCompounds(input: string): Array<[string, boolean]> {
  const tokens: Array<[string, boolean]> = [];
  let i = 0;
  while (i < input.length) {
    let matched: string | null = null;
    let matchedKey = '';
    for (const key of COMPOUND_KEYS_DESC) {
      if (key.length > input.length - i) continue;
      if (input.startsWith(key, i)) {
        matched = KANJI_COMPOUNDS[key]!;
        matchedKey = key;
        break; // 既に長い順なので最初のヒットが最長
      }
    }
    if (matched) {
      tokens.push([matched, true]);
      i += matchedKey.length;
    } else {
      tokens.push([input[i]!, false]);
      i += 1;
    }
  }
  return tokens;
}

/** 仮名→romaji の音節レベル変換（漢字は素通り）。 */
function syllableConvert(input: string): string {
  if (!input) return '';
  let out = '';
  let i = 0;
  let pendingSokuon = false; // 直前が っ/ッ
  while (i < input.length) {
    // 1. 2 文字の拗音テーブル先引き
    const two = input.slice(i, i + 2);
    const dig = DIGRAPHS[two];
    if (dig) {
      if (pendingSokuon) { out += dig[0]; pendingSokuon = false; }
      out += dig;
      i += 2;
      continue;
    }
    const ch = input[i];
    // 2. 促音
    if (ch === 'っ' || ch === 'ッ') { pendingSokuon = true; i++; continue; }
    // 3. 長音符 — 直前の母音をもう 1 文字伸ばす
    if (ch === 'ー') {
      const last = out.slice(-1);
      if (isVowel(last)) out += last;
      i++;
      continue;
    }
    // 4. 単音 kana
    const r = HIRA[ch] ?? KATA[ch];
    if (r) {
      if (pendingSokuon) { out += r[0]; pendingSokuon = false; }
      out += r;
      i++;
      continue;
    }
    // 5. それ以外（漢字 / ASCII / 記号）はそのまま
    pendingSokuon = false;
    out += ch;
    i++;
  }
  return out;
}

/** 単漢字フォールバック：仮名変換後にまだ残ってる漢字 1 字を表からそれっぽく拾う。 */
function applySingleKanjiFallback(input: string): string {
  let out = '';
  for (const ch of input) {
    const r = KANJI_SINGLE[ch];
    out += r ?? ch;
  }
  return out;
}

/** kana / 漢字を含む文字列をベストエフォートで romaji 化。 */
export function kanaToRomaji(input: string): string {
  if (!input) return '';
  // 1. 漢字複合語を最長一致で先に英語へ
  const tokens = applyKanjiCompounds(input);
  // 2. トークン単位で：置換済みはそのまま、未置換は仮名変換にかける
  let mid = '';
  for (let idx = 0; idx < tokens.length; idx++) {
    const [tok, replaced] = tokens[idx]!;
    if (replaced) {
      // 置換済み英語の前後にスペースを差し込む（前の語と詰まらないように）
      const needLeftSpace = mid.length > 0 && !/\s$/.test(mid);
      mid += (needLeftSpace ? ' ' : '') + tok;
    } else {
      mid += tok;
    }
  }
  // 3. 残った仮名を音節変換
  const afterKana = syllableConvert(mid);
  // 4. それでも残った漢字 1 字を救済
  const afterSingle = applySingleKanjiFallback(afterKana);
  // 5. 余計な連続スペースを 1 個に圧縮
  return afterSingle.replace(/\s{2,}/g, ' ').trim();
}

/** 単語頭を大文字化（ASCII 範囲のみ）。固有名詞向け。 */
export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * 固有名詞（店名 / ニックネーム等）を EN モードで強制ローマ字化。
 * - kana 部分は kanaToRomaji で変換
 * - 漢字は残る（手元辞書なし）
 * - 結果を Title Case
 */
export function romanizeProperNoun(jp: string, lang: 'ja' | 'en'): string {
  if (lang === 'ja' || !jp) return jp;
  return titleCase(kanaToRomaji(jp));
}
