'use strict';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

export async function transcribeAudioChunk({ blob, mimeType, language, provider, groqApiKey }) {
  if (provider === 'groq') {
    if (!groqApiKey) {
      return { text: '', status: 'Groq API キーが未設定です' };
    }
    return transcribeWithGroq({ blob, mimeType, language, apiKey: groqApiKey });
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
