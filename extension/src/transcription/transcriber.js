'use strict';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

// 無料枠のRPD(1日1,500リクエスト)対策のためFlash-Lite固定（詳細は docs/gemini-notes.md）
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_TRANSCRIPTION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// RPD(日次上限)到達後に6秒毎の無駄なリクエストを送り続けないためのフラグ。
// キャプチャ開始時に resetGeminiDailyLimitFlag() でリセットする
let geminiDailyLimitReached = false;

export function resetGeminiDailyLimitFlag() {
  geminiDailyLimitReached = false;
}

export async function transcribeAudioChunk({ blob, mimeType, language, provider, groqApiKey, geminiApiKey }) {
  if (provider === 'groq') {
    if (!groqApiKey) {
      return { text: '', status: 'Groq API キーが未設定です' };
    }
    return transcribeWithGroq({ blob, mimeType, language, apiKey: groqApiKey });
  }

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      return { text: '', status: 'Gemini API キーが未設定です' };
    }
    if (geminiDailyLimitReached) {
      return {
        text: '',
        status: '本日のGemini無料枠(RPD)の上限に達した可能性があります。エンジンを切り替えるか翌日にご利用ください'
      };
    }
    return transcribeWithGemini({ blob, mimeType, language, apiKey: geminiApiKey });
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
    return { text: '', status: 'ハルシネーションらしい認識結果を破棄しました' };
  }

  return { text, status: text ? '認識結果を保存しました' : '認識結果は空でした' };
}

async function transcribeWithGemini({ blob, mimeType, language, apiKey }) {
  const fileType = normalizeMimeType(mimeType || blob.type);
  const base64Audio = await blobToBase64(blob);

  const response = await fetch(`${GEMINI_TRANSCRIPTION_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildGeminiTranscriptionPrompt(language) },
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
  const text = extractGeminiText(result);

  if (isLikelyHallucination(text)) {
    return { text: '', status: 'ハルシネーションらしい認識結果を破棄しました' };
  }

  return { text, status: text ? '認識結果を保存しました' : '認識結果は空でした' };
}

// 429のエラーボディからRPM(一時的)かRPD(日次上限)かを判別する。
// quotaId に "PerDay" を含む violation があればRPDと判断する
async function handleGeminiRateLimit(response) {
  const body = await response.text().catch(() => '');
  if (/per\s*day|perday/i.test(body)) {
    geminiDailyLimitReached = true;
    return {
      text: '',
      status: '本日のGemini無料枠(RPD)の上限に達した可能性があります。エンジンを切り替えるか翌日にご利用ください'
    };
  }
  return { text: '', status: '一時的なレート制限のためスキップしました' };
}

function buildGeminiTranscriptionPrompt(language) {
  const languageNames = {
    ja: '日本語',
    en: '英語',
    ko: '韓国語',
    'zh-CN': '中国語(簡体字)',
    'zh-TW': '中国語(繁体字)'
  };
  const hint = language && language !== 'auto' && languageNames[language]
    ? `音声は主に${languageNames[language]}です。`
    : '';
  return (
    'この音声を文字起こししてください。' +
    hint +
    '発話内容のテキストのみを出力し、説明・翻訳・注釈・記号による装飾は一切付けないでください。' +
    '発話がない場合は何も出力しないでください。'
  );
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

function isLikelyHallucination(text) {
  const normalized = text.toLowerCase().replace(/[。、！？!?,.\s]/g, '');
  if (normalized.length < 2) return true;

  return [
    'ご視聴ありがとうございました',
    'ご視聴ありがとうございます',
    'ありがとうございました',
    'チャンネル登録よろしくお願いします',
    'thankyouforwatching',
    'thanksforwatching',
    'pleasesubscribe'
  ].some((pattern) => normalized === pattern.toLowerCase().replace(/[。、！？!?,.\s]/g, ''));
}
