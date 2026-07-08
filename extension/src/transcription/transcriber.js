'use strict';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

// 旧世代(2.5系)は無料枠RPDが極端に小さい(実測で1日20回)ため、現行世代のFlash-Liteを使う。
// 無料枠の上限はモデル・アカウントごとに異なる（詳細は docs/gemini-notes.md）
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_TRANSCRIPTION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// RPD(日次上限)到達後に6秒毎の無駄なリクエストを送り続けないためのフラグ。
// キャプチャ開始時に resetGeminiDailyLimitFlag() でリセットする
let geminiDailyLimitReached = false;

export function resetGeminiDailyLimitFlag() {
  geminiDailyLimitReached = false;
}

export async function transcribeAudioChunk({
  blob,
  mimeType,
  language,
  provider,
  groqApiKey,
  geminiApiKey,
  fasterWhisperUrl,
  fasterWhisperModel,
  translationEnabled,
  translationProvider,
  targetLanguage
}) {
  if (provider === 'groq') {
    if (!groqApiKey) {
      return { text: '', status: 'Groq API キーが未設定です', level: 'error' };
    }
    return transcribeWithGroq({ blob, mimeType, language, apiKey: groqApiKey });
  }

  if (provider === 'faster-whisper') {
    if (!fasterWhisperUrl) {
      return { text: '', status: 'Faster-Whisper サーバーの URL が未設定です', level: 'error' };
    }
    return transcribeWithFasterWhisper({
      blob,
      mimeType,
      language,
      url: fasterWhisperUrl,
      model: fasterWhisperModel || 'large-v3-turbo'
    });
  }

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      return { text: '', status: 'Gemini API キーが未設定です', level: 'error' };
    }
    if (geminiDailyLimitReached) {
      return {
        text: '',
        status: '本日のGemini無料枠(RPD)の上限に達しました。エンジンを切り替えるか翌日にご利用ください',
        level: 'error'
      };
    }
    return transcribeWithGemini({
      blob,
      mimeType,
      language,
      apiKey: geminiApiKey,
      translate: shouldTranslateWithGemini({ language, translationEnabled, translationProvider, targetLanguage }),
      targetLanguage
    });
  }

  return {
    text: '',
    status: '音声チャンクを取得しました。認識エンジンを設定してください'
  };
}

async function transcribeWithGroq({ blob, mimeType, language, apiKey }) {
  const fileType = normalizeMimeType(mimeType || blob.type);
  const file = new File([blob], `stream-audio.${extensionForMimeType(fileType)}`, { type: fileType });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', GROQ_MODEL);

  const whisperLanguage = normalizeWhisperLanguage(language);
  if (whisperLanguage) formData.append('language', whisperLanguage);

  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq API ${response.status}: ${body || response.statusText}`);
  }

  const result = await response.json();
  const text = String(result.text || '').trim();

  if (isLikelyHallucination(text)) {
    return { text: '', status: 'ハルシネーションらしい認識結果を破棄しました', level: 'warn' };
  }

  return { text, status: text ? '認識結果を保存しました' : '認識結果は空でした' };
}

// ローカルの Faster-Whisper サーバー（uv/server.py）へ送信する。
// 任意の外部ホストへ音声を送信できてしまわないよう、URL は localhost / 127.0.0.1 のみ許可する
async function transcribeWithFasterWhisper({ blob, mimeType, language, url, model }) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url)) {
    throw new Error('Faster-Whisper の URL は localhost / 127.0.0.1 のみ指定できます');
  }

  const fileType = normalizeMimeType(mimeType || blob.type);
  const file = new File([blob], `stream-audio.${extensionForMimeType(fileType)}`, { type: fileType });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);

  const whisperLanguage = normalizeWhisperLanguage(language);
  if (whisperLanguage) formData.append('language', whisperLanguage);

  const controller = new AbortController();
  // サーバー起動直後のモデル読み込み待ちを考慮し30秒でタイムアウトする
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(url, { method: 'POST', body: formData, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Faster-Whisper サーバーの応答がタイムアウトしました（起動直後はモデル読み込み中の可能性があります）');
    }
    throw new Error(`Faster-Whisper サーバーに接続できません（起動しているか uv/README.md を確認してください）: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Faster-Whisper サーバー ${response.status}: ${body.slice(0, 200) || response.statusText}`);
  }

  const result = await response.json();
  const text = String(result.text || '').trim();

  if (isLikelyHallucination(text)) {
    return { text: '', status: 'ハルシネーションらしい認識結果を破棄しました', level: 'warn' };
  }

  return { text, status: text ? '認識結果を保存しました' : '認識結果は空でした' };
}

async function transcribeWithGemini({ blob, mimeType, language, apiKey, translate, targetLanguage }) {
  const fileType = normalizeMimeType(mimeType || blob.type);
  const base64Audio = await blobToBase64(blob);

  const response = await fetch(`${GEMINI_TRANSCRIPTION_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildGeminiTranscriptionPrompt(language, translate ? targetLanguage : '') },
            { inline_data: { mime_type: fileType, data: base64Audio } }
          ]
        }
      ],
      // 訳文や補足説明の混入を抑えるため温度は0にする
      generationConfig: { temperature: 0 }
    })
  });

  if (response.status === 429) {
    return handleGeminiRateLimit(response);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API ${response.status}: ${body || response.statusText}`);
  }

  const result = await response.json();
  const rawText = extractGeminiText(result);
  const payload = translate ? parseGeminiTranscriptPayload(rawText) : { transcript: rawText, translation: '' };
  const text = payload.transcript;

  if (isLikelyHallucination(text)) {
    return { text: '', status: 'ハルシネーションらしい認識結果を破棄しました', level: 'warn' };
  }

  return {
    text,
    translatedText: payload.translation,
    translationHandled: Boolean(translate && payload.parsed),
    status: text ? '認識結果を保存しました' : '認識結果は空でした'
  };
}

// 429のエラーボディからRPM(一時的)かRPD(日次上限)かを判別する。
// ボディ全体の文字列一致だと説明文中の "per day" 等に誤反応するため、
// 構造化された QuotaFailure.violations の quotaId だけを判定に使う
async function handleGeminiRateLimit(response) {
  const body = await response.text().catch(() => '');
  // 判定の検証用に生のエラーボディを残す（offscreenのDevToolsコンソールで確認できる）
  console.error('Gemini API 429:', body);

  const violations = extractGeminiQuotaViolations(body);
  const daily = violations.find((violation) => /perday/i.test(violation?.quotaId || ''));

  if (daily) {
    geminiDailyLimitReached = true;
    const limit = daily.quotaValue ? `1日${daily.quotaValue}回` : 'RPD';
    return {
      text: '',
      status: `本日のGemini無料枠(${limit})の上限に達しました。エンジンを切り替えるか翌日にご利用ください`,
      level: 'error'
    };
  }
  return { text: '', status: '一時的なレート制限のためスキップしました', level: 'warn' };
}

// エラーボディJSONから QuotaFailure の violations 配列を取り出す（無ければ空配列）
function extractGeminiQuotaViolations(body) {
  try {
    const details = JSON.parse(body)?.error?.details;
    if (!Array.isArray(details)) return [];
    return details.flatMap((detail) => (Array.isArray(detail?.violations) ? detail.violations : []));
  } catch (_) {
    return [];
  }
}

function buildGeminiTranscriptionPrompt(language, targetLanguage) {
  const languageNames = {
    ja: '日本語',
    en: '英語',
    ko: '韓国語',
    'zh-CN': '中国語(簡体字)',
    'zh-TW': '中国語(繁体字)',
    fr: 'フランス語',
    de: 'ドイツ語',
    es: 'スペイン語',
    pt: 'ポルトガル語',
    ru: 'ロシア語',
    it: 'イタリア語'
  };
  const hint = language && language !== 'auto' && languageNames[language]
    ? `音声は主に${languageNames[language]}です。`
    : '';
  if (targetLanguage) {
    const target = languageNames[targetLanguage] || targetLanguage;
    return (
      'この音声を文字起こしし、指定された言語へ翻訳してください。' +
      hint +
      `翻訳先は${target}です。` +
      '出力はJSONのみとし、Markdown・説明・注釈・コードブロックは付けないでください。' +
      '形式は {"transcript":"音声の文字起こし","translation":"翻訳結果"} です。' +
      '発話がない場合は {"transcript":"","translation":""} を出力してください。'
    );
  }
  return (
    'この音声を文字起こししてください。' +
    hint +
    '発話内容のテキストのみを出力し、説明・翻訳・注釈・記号による装飾は一切付けないでください。' +
    '発話がない場合は何も出力しないでください。'
  );
}

function shouldTranslateWithGemini({ language, translationEnabled, translationProvider, targetLanguage }) {
  if (!translationEnabled || translationProvider !== 'gemini' || !targetLanguage) return false;
  return language === 'auto' || language !== targetLanguage;
}

function parseGeminiTranscriptPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { transcript: '', translation: '', parsed: true };

  const jsonText = extractJsonObject(stripCodeFence(text));
  try {
    const data = JSON.parse(jsonText);
    return {
      transcript: String(data?.transcript || '').trim(),
      translation: String(data?.translation || '').trim(),
      parsed: true
    };
  } catch (_) {
    return { transcript: text, translation: '', parsed: false };
  }
}

function stripCodeFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function extractGeminiText(result) {
  const parts = result?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => String(part?.text || ''))
    .join('')
    .trim();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // data:audio/webm;base64,xxxx の形式からbase64部分のみ取り出す
      const dataUrl = String(reader.result || '');
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('音声データのbase64変換に失敗しました'));
    reader.readAsDataURL(blob);
  });
}

function normalizeWhisperLanguage(language) {
  if (!language || language === 'auto') return '';
  return {
    'zh-CN': 'zh',
    'zh-TW': 'zh'
  }[language] || language;
}

function normalizeMimeType(type) {
  if (type === 'audio/mp4' || type === 'audio/m4a' || type === 'audio/x-m4a') return 'audio/mp4';
  if (type === 'audio/ogg') return 'audio/ogg';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'audio/wav';
  return 'audio/webm';
}

function extensionForMimeType(type) {
  if (type === 'audio/mp4') return 'm4a';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/wav') return 'wav';
  return 'webm';
}

// 文字位置ベースの類似度（同じ長さ付近の文の一致率）。編集距離までは計算せず軽量に判定する
function sentenceSimilarity(a, b) {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const minLen = Math.min(a.length, b.length);
  let same = 0;
  for (let i = 0; i < minLen; i += 1) {
    if (a[i] === b[i]) same += 1;
  }
  return same / len;
}

// Whisperの反復ハルシネーション検出: ほぼ同一の短文が連続して繰り返される場合を検出する
function hasRepeatedSentenceLoop(text) {
  const sentences = text
    .split(/[。！？.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  if (sentences.length < 3) return false;

  let repeatCount = 0;
  for (let i = 1; i < sentences.length; i += 1) {
    if (sentenceSimilarity(sentences[i - 1], sentences[i]) >= 0.7) repeatCount += 1;
  }
  return repeatCount >= 2;
}

function isLikelyHallucination(text) {
  if (hasRepeatedSentenceLoop(text)) return true;

  const normalized = text.toLowerCase().replace(/[。、！？!?,.\s]/g, '');
  if (!normalized) return false;

  return [
    'ご視聴ありがとうございました',
    'ご視聴ありがとうございます',
    'チャンネル登録よろしくお願いします',
    'thankyouforwatching',
    'thanksforwatching',
    'pleasesubscribe'
  ].some((pattern) => normalized === pattern.toLowerCase().replace(/[。、！？!?,.\s]/g, ''));
}
