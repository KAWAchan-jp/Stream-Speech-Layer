'use strict';

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
const SUPPORTED_URL_PATTERN = /^https?:\/\//;
// tabCaptureが機能しない/権限上許可されないページ（ブラウザの拡張機能ストア）は個別に除外する
const RESTRICTED_URL_PATTERN = /^https?:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/;
const TRANSLATION_CACHE_MAX = 300;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_TRANSLATION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const AUTO_STOP_ALARM = 'auto-stop';
const AUTO_STOP_TICK = 'auto-stop-tick';
const AUTO_STOP_FINAL = 'auto-stop-final';
const FINAL_COUNTDOWN_MS = 10000;

let activeSession = null;
let finalCountdownTimer = null;
const translationCache = new Map();

// タイマー稼働中は残り分、それ以外は起動状態に応じてバッジを更新する
async function refreshBadge() {
  // 最後の秒読み中は秒表示を優先する
  if (finalCountdownTimer) return;
  const { isEnabled, autoStopAt } = await storageGet(['isEnabled', 'autoStopAt']);
  if (autoStopAt && autoStopAt > Date.now()) {
    const minutes = Math.ceil((autoStopAt - Date.now()) / 60000);
    chrome.action.setBadgeText({ text: String(minutes) });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    return;
  }
  chrome.action.setBadgeText({ text: isEnabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: isEnabled ? '#4caf50' : '#888888' });
}

// 停止直前の数秒だけ、バッジへ秒を赤で表示する（ベストエフォート）
function startFinalCountdown(autoStopAt) {
  stopFinalCountdown();
  chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
  const tick = () => {
    const remaining = autoStopAt - Date.now();
    if (remaining <= 0) {
      stopFinalCountdown();
      return;
    }
    chrome.action.setBadgeText({ text: String(Math.ceil(remaining / 1000)) });
  };
  tick();
  finalCountdownTimer = setInterval(tick, 1000);
}

function stopFinalCountdown() {
  if (finalCountdownTimer) {
    clearInterval(finalCountdownTimer);
    finalCountdownTimer = null;
  }
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(values) {
  return chrome.storage.local.set(values);
}

function sendToTab(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

async function broadcastSessionState(enabled, text) {
  if (!activeSession?.tabId) return;
  sendToTab(activeSession.tabId, { type: 'state-changed', enabled });
  if (text) sendToTab(activeSession.tabId, { type: 'stream-status', text });
}

async function hasOffscreenDocument() {
  if (chrome.offscreen?.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  if (!chrome.runtime.getContexts) return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Capture the current tab audio for user-started transcription.'
    });
  } catch (error) {
    if (/single offscreen document|already exists/i.test(error.message || '')) return;
    throw error;
  }
}

function getMediaStreamId(targetTabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(streamId);
    });
  });
}

async function startCapture(tab) {
  if (!tab?.id || !SUPPORTED_URL_PATTERN.test(tab.url || '') || RESTRICTED_URL_PATTERN.test(tab.url || '')) {
    throw new Error('対応していないページです（chrome:// や拡張機能ストアなどでは使用できません）');
  }

  await reconcileStaleSession();

  if (activeSession?.tabId && activeSession.tabId !== tab.id) {
    throw new Error(`他のタブ（${activeSession.title || activeSession.url}）で実行中です。先に停止してください。`);
  }

  await ensureOffscreenDocument();
  const streamId = await getMediaStreamId(tab.id);
  const settings = await storageGet([
    'transcriptionProvider',
    'groqApiKey',
    'geminiApiKey',
    'fasterWhisperUrl',
    'fasterWhisperModel',
    'sourceLanguage',
    'translationEnabled',
    'translationProvider',
    'targetLanguage',
    'chunkMillis',
    'vadThreshold',
    'silenceMillis'
  ]);

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen-capture',
    type: 'start-capture',
    streamId,
    tabId: tab.id,
    url: tab.url,
    title: tab.title || '',
    settings
  });

  if (!response?.ok) {
    throw new Error(response?.error || '音声キャプチャを開始できませんでした');
  }

  activeSession = { tabId: tab.id, url: tab.url, title: tab.title || '' };
  await storageSet({
    isEnabled: true,
    activeTabId: tab.id,
    activeUrl: tab.url,
    activeTitle: tab.title || ''
  });
  // タイマーが予約済みなら、開始と同時にカウントダウンを始める
  const { autoStopEnabled, autoStopMinutes } = await storageGet(['autoStopEnabled', 'autoStopMinutes']);
  if (autoStopEnabled) {
    await startAutoStopCountdown(autoStopMinutes);
  }
  await refreshBadge();
  await broadcastSessionState(true, 'タブ音声を取得中...');
  return activeSession;
}

async function stopCapture() {
  const tabId = activeSession?.tabId;

  if (await hasOffscreenDocument()) {
    await chrome.runtime.sendMessage({
      target: 'offscreen-capture',
      type: 'stop-capture'
    }).catch(() => null);
  }

  activeSession = null;
  await clearAutoStopCountdown();
  await storageSet({ isEnabled: false, activeTabId: null, activeUrl: '', activeTitle: '' });
  await refreshBadge();
  if (tabId) sendToTab(tabId, { type: 'state-changed', enabled: false });
}

// storageに残るactiveTabIdが実在するタブか確認する
async function isTabAlive(tabId) {
  if (!tabId) return false;
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (_) {
    return false;
  }
}

// Service Workerの再起動でactiveSessionが失われても、storage(正本)が「実行中」のまま
// 対象タブが既に閉じられている場合はstopCapture()で状態を確実にリセットする
async function reconcileStaleSession() {
  const { isEnabled, activeTabId } = await storageGet(['isEnabled', 'activeTabId']);
  if (!isEnabled || !activeTabId) return false;
  if (await isTabAlive(activeTabId)) return false;
  await stopCapture();
  return true;
}

function clampMinutes(minutes) {
  return Math.min(Math.max(Math.round(Number(minutes) || 0), 1), 60);
}

// カウントダウン開始: 指定分後に alarm を発火させ、完全停止する
// バッジへ残り分を出すため 1分周期の tick、秒読み用に停止10秒前の final も張る
async function startAutoStopCountdown(minutes) {
  const value = clampMinutes(minutes);
  const when = Date.now() + value * 60000;
  await chrome.alarms.clear(AUTO_STOP_ALARM);
  await chrome.alarms.clear(AUTO_STOP_TICK);
  await chrome.alarms.clear(AUTO_STOP_FINAL);
  stopFinalCountdown();
  chrome.alarms.create(AUTO_STOP_ALARM, { when });
  chrome.alarms.create(AUTO_STOP_TICK, { periodInMinutes: 1 });
  chrome.alarms.create(AUTO_STOP_FINAL, { when: when - FINAL_COUNTDOWN_MS });
  await storageSet({ autoStopAt: when, autoStopMinutes: value });
  await refreshBadge();
  return { autoStopAt: when, autoStopMinutes: value };
}

// カウントダウンだけ止める（予約 autoStopEnabled は保持する）
async function clearAutoStopCountdown() {
  await chrome.alarms.clear(AUTO_STOP_ALARM);
  await chrome.alarms.clear(AUTO_STOP_TICK);
  await chrome.alarms.clear(AUTO_STOP_FINAL);
  stopFinalCountdown();
  await storageSet({ autoStopAt: null });
  await refreshBadge();
}

// チェックのON/OFF: 予約を保存し、取得中なら即カウントダウン開始/停止する
async function armAutoStop(enabled, minutes) {
  const value = clampMinutes(minutes);
  await storageSet({ autoStopEnabled: Boolean(enabled), autoStopMinutes: value });
  const { isEnabled } = await storageGet(['isEnabled']);
  if (enabled && isEnabled) {
    return { autoStopEnabled: true, ...(await startAutoStopCountdown(value)) };
  }
  await clearAutoStopCountdown();
  return { autoStopEnabled: Boolean(enabled), autoStopAt: null, autoStopMinutes: value };
}

// スライダー変更: 分を保存し、カウントダウン中なら今からで張り直す
async function setAutoStopMinutes(minutes) {
  const value = clampMinutes(minutes);
  await storageSet({ autoStopMinutes: value });
  const { autoStopAt } = await storageGet(['autoStopAt']);
  if (autoStopAt && autoStopAt > Date.now()) {
    return { autoStopEnabled: true, ...(await startAutoStopCountdown(value)) };
  }
  return { autoStopAt: null, autoStopMinutes: value };
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_STOP_TICK) {
    // バッジの残り分を更新（残りが尽きたら本体アラームが停止する）
    refreshBadge().catch(() => {});
    return;
  }
  if (alarm.name === AUTO_STOP_FINAL) {
    // 停止10秒前: バッジを秒読みに切り替える
    storageGet(['autoStopAt']).then(({ autoStopAt }) => {
      if (autoStopAt && autoStopAt > Date.now()) startFinalCountdown(autoStopAt);
    });
    return;
  }
  if (alarm.name !== AUTO_STOP_ALARM) return;
  // 停止前に読み取りステータスへ知らせてから完全停止する
  stopFinalCountdown();
  if (activeSession?.tabId) {
    sendToTab(activeSession.tabId, { type: 'stream-status', text: '⏰ 自動停止タイマーにより停止しました' });
  }
  stopCapture().catch(() => {});
});

async function appendTranscript(text, meta = {}) {
  const result = await storageGet(['transcriptLog']);
  const translatedText = meta.translationHandled
    ? String(meta.translatedText || '')
    : await translateTranscriptIfNeeded(text).catch((error) => {
      if (activeSession?.tabId) {
        // 翻訳は認識と違いGoogle翻訳への切替で継続できるため警告(オレンジ)扱い
        sendToTab(activeSession.tabId, { type: 'stream-status', text: describeTranslationError(error), level: 'warn' });
      }
      return '';
    });
  const log = Array.isArray(result.transcriptLog) ? result.transcriptLog : [];
  const entry = {
    text,
    translatedText,
    source: meta.source || activeSession?.title || '',
    url: meta.url || activeSession?.url || '',
    timestamp: new Date().toISOString()
  };
  const nextLog = [...log, entry].slice(-50);
  await storageSet({ transcriptLog: nextLog, lastTranscript: text, lastTranslation: translatedText });
  if (activeSession?.tabId) sendToTab(activeSession.tabId, { type: 'transcript-update', text, translatedText });
  return { entry, count: nextLog.length };
}

// 翻訳エラーを読み取りステータス向けの警告文に変換する
function describeTranslationError(error) {
  const message = error?.message || String(error);
  if (/DeepL/i.test(message) && /\b456\b/.test(message)) {
    return '⚠ DeepLの月間上限に達しました。翻訳エンジンをGoogleに切り替えてください（精度は低下します）';
  }
  if (/Gemini/i.test(message) && /\b429\b/.test(message)) {
    return '⚠ Geminiの利用上限に達しました。翻訳エンジンをGoogleまたはDeepLに切り替えるか、時間をおいて再試行してください';
  }
  if (/\b429\b/.test(message) || /\b456\b/.test(message)) {
    return '⚠ 翻訳の利用上限に達しました。翻訳エンジンをGoogleに切り替えるか、時間をおいて再試行してください';
  }
  return `翻訳エラー: ${message}`;
}

async function translateTranscriptIfNeeded(text) {
  if (!text?.trim()) return '';

  const settings = await storageGet([
    'translationEnabled',
    'translationProvider',
    'sourceLanguage',
    'targetLanguage',
    'deeplApiKey',
    'geminiApiKey'
  ]);

  if (!settings.translationEnabled) return '';

  const provider = settings.translationProvider || 'google';
  const from = settings.sourceLanguage || 'auto';
  const to = settings.targetLanguage || 'ja';

  if (from !== 'auto' && from === to) return '';

  const cacheKey = `${provider}:${from}:${to}:${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  let translatedText = '';
  if (provider === 'google') {
    translatedText = await translateWithGoogle(text, from, to);
  } else if (provider === 'deepl') {
    if (!settings.deeplApiKey) throw new Error('DeepL API キーが未設定です');
    translatedText = await translateWithDeepL(text, from, to, settings.deeplApiKey);
  } else if (provider === 'gemini') {
    if (!settings.geminiApiKey) throw new Error('Gemini API キーが未設定です');
    translatedText = await translateWithGemini(text, from, to, settings.geminiApiKey);
  }

  if (translationCache.size >= TRANSLATION_CACHE_MAX) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(cacheKey, translatedText);
  return translatedText;
}

async function translateWithGemini(text, from, to, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${GEMINI_TRANSLATION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildGeminiTranslationPrompt(text, from, to) }
            ]
          }
        ],
        generationConfig: { temperature: 0 }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini translation HTTP ${response.status}${body ? `: ${body.slice(0, 120)}` : ''}`);
    }

    const data = await response.json();
    return extractGeminiText(data);
  } finally {
    clearTimeout(timer);
  }
}

function buildGeminiTranslationPrompt(text, from, to) {
  const source = languageLabel(from);
  const target = languageLabel(to);
  return (
    `次のテキストを${target}へ翻訳してください。` +
    (from && from !== 'auto' ? `原文の主な言語は${source}です。` : '') +
    '翻訳結果のテキストのみを出力し、説明・注釈・引用符・Markdownは付けないでください。\n\n' +
    text
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

function languageLabel(language) {
  return {
    ja: '日本語',
    en: '英語',
    ko: '韓国語',
    'zh-CN': '中国語(簡体字)',
    'zh-TW': '中国語(繁体字)',
    auto: '自動判定'
  }[language] || language || '自動判定';
}

async function translateWithGoogle(text, from, to) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const sourceLang = normalizeGoogleLanguage(from);
    const targetLang = normalizeGoogleLanguage(to);
    const url = 'https://translate.googleapis.com/translate_a/single'
      + `?client=gtx&sl=${encodeURIComponent(sourceLang)}`
      + `&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Google Translate HTTP ${response.status}`);
    const data = await response.json();
    return (data[0] || []).map((item) => item?.[0]).filter(Boolean).join('') || '';
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGoogleLanguage(language) {
  if (!language || language === 'auto') return 'auto';
  return language;
}

async function translateWithDeepL(text, from, to, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const isFreeApiKey = apiKey.endsWith(':fx');
  const host = isFreeApiKey ? 'api-free.deepl.com' : 'api.deepl.com';
  const authKey = isFreeApiKey ? apiKey.slice(0, -3) : apiKey;
  const targetLang = normalizeDeepLTargetLanguage(to);
  const sourceLang = from === 'auto' ? '' : normalizeDeepLSourceLanguage(from);

  try {
    const body = new URLSearchParams({ text, target_lang: targetLang });
    if (sourceLang) body.append('source_lang', sourceLang);

    const response = await fetch(`https://${host}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${authKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DeepL HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 120)}` : ''}`);
    }
    const data = await response.json();
    return data.translations?.[0]?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDeepLSourceLanguage(language) {
  const map = {
    en: 'EN',
    ja: 'JA',
    ko: 'KO'
  };
  return map[language] || language.toUpperCase().replace('-', '_');
}

function normalizeDeepLTargetLanguage(language) {
  if (language === 'en') return 'EN-US';
  return normalizeDeepLSourceLanguage(language);
}

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    isEnabled: false,
    transcriptLog: [],
    lastTranscript: '',
    lastTranslation: '',
    transcriptionProvider: 'none',
    sourceLanguage: 'ja',
    fasterWhisperUrl: 'http://127.0.0.1:8765/transcribe',
    fasterWhisperModel: 'large-v3-turbo',
    translationEnabled: false,
    translationProvider: 'google',
    targetLanguage: 'ja',
    // Gemini無料枠のRPD(1日1,500リクエスト)対策で6秒=10req/分に設定（docs/gemini-notes.md参照）
    chunkMillis: 6000,
    vadThreshold: 10,
    silenceMillis: 700,
    autoStopAt: null,
    autoStopMinutes: 10,
    autoStopEnabled: false
  };
  const stored = await storageGet(Object.keys(defaults));
  const nextValues = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (stored[key] === undefined) nextValues[key] = value;
  }
  if (Object.keys(nextValues).length > 0) await storageSet(nextValues);
  await refreshBadge();
});

// ブラウザ起動時: 前回終了時のstale状態(閉じられたタブの旧activeTabId等)を掃除する
chrome.runtime.onStartup.addListener(() => {
  reconcileStaleSession().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopIfActiveTab(tabId).catch(() => {});
});

// Service Worker再起動直後はactiveSessionがnullのため、storageのactiveTabIdでも判定する
async function stopIfActiveTab(removedTabId) {
  if (activeSession?.tabId === removedTabId) {
    await stopCapture();
    return;
  }
  const { isEnabled, activeTabId } = await storageGet(['isEnabled', 'activeTabId']);
  if (isEnabled && activeTabId === removedTabId) {
    await stopCapture();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'startCapture') {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => startCapture(tab))
      .then((session) => sendResponse({ ok: true, enabled: true, session }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'stopCapture') {
    stopCapture()
      .then(() => sendResponse({ ok: true, enabled: false }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'toggle') {
    storageGet(['isEnabled'])
      .then((result) => {
        if (result.isEnabled) return stopCapture().then(() => ({ enabled: false }));
        return chrome.tabs.query({ active: true, currentWindow: true })
          .then(([tab]) => startCapture(tab))
          .then(() => ({ enabled: true }));
      })
      .then((result) => sendResponse({ ok: true, enabled: result.enabled }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'armAutoStop') {
    armAutoStop(message.enabled, message.minutes)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'setAutoStopMinutes') {
    setAutoStopMinutes(message.minutes)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'get-own-tab-id') {
    sendResponse({ ok: true, tabId: sender.tab?.id ?? null });
    return true;
  }

  if (message.type === 'getState') {
    // popupが開くたびに呼ばれる。応答前にstale状態(閉じられたタブが実行中扱いのまま)を修復する
    reconcileStaleSession().catch(() => {}).then(() => storageGet([
      'isEnabled',
      'transcriptLog',
      'lastTranscript',
      'lastTranslation',
      'activeTitle',
      'activeUrl',
      'activeTabId',
      'transcriptionProvider',
      'sourceLanguage',
      'groqApiKey',
      'geminiApiKey',
      'fasterWhisperUrl',
      'fasterWhisperModel',
      'translationEnabled',
      'translationProvider',
      'targetLanguage',
      'deeplApiKey',
      'autoStopAt',
      'autoStopMinutes',
      'autoStopEnabled'
    ])).then((result) => {
      sendResponse({
        ok: true,
        enabled: Boolean(result.isEnabled),
        transcriptLog: Array.isArray(result.transcriptLog) ? result.transcriptLog : [],
        lastTranscript: result.lastTranscript || '',
        lastTranslation: result.lastTranslation || '',
        activeTitle: result.activeTitle || '',
        activeUrl: result.activeUrl || '',
        activeTabId: result.activeTabId || null,
        transcriptionProvider: result.transcriptionProvider || 'none',
        sourceLanguage: result.sourceLanguage || 'ja',
        hasGroqApiKey: Boolean(result.groqApiKey),
        hasGeminiApiKey: Boolean(result.geminiApiKey),
        fasterWhisperUrl: result.fasterWhisperUrl || 'http://127.0.0.1:8765/transcribe',
        fasterWhisperModel: result.fasterWhisperModel || 'large-v3-turbo',
        translationEnabled: Boolean(result.translationEnabled),
        translationProvider: result.translationProvider || 'google',
        targetLanguage: result.targetLanguage || 'ja',
        hasDeepLApiKey: Boolean(result.deeplApiKey),
        autoStopAt: Number(result.autoStopAt) || null,
        autoStopMinutes: Number(result.autoStopMinutes) || 10,
        autoStopEnabled: Boolean(result.autoStopEnabled)
      });
    });
    return true;
  }

  if (message.type === 'saveSettings') {
    const values = {
      transcriptionProvider: message.transcriptionProvider || 'none',
      sourceLanguage: message.sourceLanguage || 'ja',
      fasterWhisperUrl: message.fasterWhisperUrl || 'http://127.0.0.1:8765/transcribe',
      fasterWhisperModel: message.fasterWhisperModel || 'large-v3-turbo',
      translationEnabled: Boolean(message.translationEnabled),
      translationProvider: message.translationProvider || 'google',
      targetLanguage: message.targetLanguage || 'ja'
    };
    if (message.clearGroqApiKey) {
      values.groqApiKey = '';
    } else if (typeof message.groqApiKey === 'string' && message.groqApiKey.trim()) {
      values.groqApiKey = message.groqApiKey.trim();
    }
    if (message.clearDeepLApiKey) {
      values.deeplApiKey = '';
    } else if (typeof message.deeplApiKey === 'string' && message.deeplApiKey.trim()) {
      values.deeplApiKey = message.deeplApiKey.trim();
    }
    if (message.clearGeminiApiKey) {
      values.geminiApiKey = '';
    } else if (typeof message.geminiApiKey === 'string' && message.geminiApiKey.trim()) {
      values.geminiApiKey = message.geminiApiKey.trim();
    }
    storageSet(values)
      .then(() => storageGet(['groqApiKey', 'deeplApiKey', 'geminiApiKey']))
      .then((result) => sendResponse({
        ok: true,
        hasGroqApiKey: Boolean(result.groqApiKey),
        hasDeepLApiKey: Boolean(result.deeplApiKey),
        hasGeminiApiKey: Boolean(result.geminiApiKey)
      }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'transcript') {
    appendTranscript(message.text, {
      ...(message.meta || {}),
      translatedText: message.translatedText,
      translationHandled: Boolean(message.translationHandled)
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'capture-status') {
    if (activeSession?.tabId) {
      sendToTab(activeSession.tabId, {
        type: 'stream-status',
        text: message.text,
        // level('info'|'warn'|'error')を優先し、旧形式のisErrorはerror扱いで中継する
        level: message.level || (message.isError ? 'error' : 'info')
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'capture-stopped') {
    const tabId = activeSession?.tabId || sender.tab?.id;
    activeSession = null;
    clearAutoStopCountdown()
      .then(() => storageSet({ isEnabled: false, activeTabId: null, activeUrl: '', activeTitle: '' }))
      .then(() => refreshBadge())
      .catch(() => {});
    if (tabId) sendToTab(tabId, { type: 'state-changed', enabled: false });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
