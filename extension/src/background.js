'use strict';

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';
const SUPPORTED_URL_PATTERN = /^https:\/\/(www\.)?(youtube\.com|twitch\.tv)\//;
const TRANSLATION_CACHE_MAX = 300;

let activeSession = null;
const translationCache = new Map();

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#4caf50' : '#888888' });
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
  if (!tab?.id || !SUPPORTED_URL_PATTERN.test(tab.url || '')) {
    throw new Error('YouTube または Twitch のタブで開始してください');
  }

  if (activeSession?.tabId && activeSession.tabId !== tab.id) {
    await stopCapture();
  }

  await ensureOffscreenDocument();
  const streamId = await getMediaStreamId(tab.id);
  const settings = await storageGet([
    'transcriptionProvider',
    'groqApiKey',
    'sourceLanguage',
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
  updateBadge(true);
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
  await storageSet({ isEnabled: false, activeTabId: null, activeUrl: '', activeTitle: '' });
  updateBadge(false);
  if (tabId) sendToTab(tabId, { type: 'state-changed', enabled: false });
}

async function appendTranscript(text, meta = {}) {
  const result = await storageGet(['transcriptLog']);
  const translatedText = await translateTranscriptIfNeeded(text).catch((error) => {
    if (activeSession?.tabId) {
      sendToTab(activeSession.tabId, { type: 'stream-status', text: `翻訳エラー: ${error.message}` });
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

async function translateTranscriptIfNeeded(text) {
  if (!text?.trim()) return '';

  const settings = await storageGet([
    'translationEnabled',
    'translationProvider',
    'sourceLanguage',
    'targetLanguage'
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
  }

  if (translationCache.size >= TRANSLATION_CACHE_MAX) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(cacheKey, translatedText);
  return translatedText;
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

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    isEnabled: false,
    transcriptLog: [],
    lastTranscript: '',
    lastTranslation: '',
    transcriptionProvider: 'none',
    sourceLanguage: 'ja',
    translationEnabled: false,
    translationProvider: 'google',
    targetLanguage: 'ja',
    chunkMillis: 5000,
    vadThreshold: 10,
    silenceMillis: 700
  };
  const stored = await storageGet(Object.keys(defaults));
  const nextValues = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (stored[key] === undefined) nextValues[key] = value;
  }
  if (Object.keys(nextValues).length > 0) await storageSet(nextValues);
  updateBadge(false);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSession?.tabId === tabId) {
    stopCapture().catch(() => {});
  }
});

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

  if (message.type === 'getState') {
    storageGet([
      'isEnabled',
      'transcriptLog',
      'lastTranscript',
      'lastTranslation',
      'activeTitle',
      'activeUrl',
      'transcriptionProvider',
      'sourceLanguage',
      'groqApiKey',
      'translationEnabled',
      'translationProvider',
      'targetLanguage'
    ]).then((result) => {
      sendResponse({
        ok: true,
        enabled: Boolean(result.isEnabled),
        transcriptLog: Array.isArray(result.transcriptLog) ? result.transcriptLog : [],
        lastTranscript: result.lastTranscript || '',
        lastTranslation: result.lastTranslation || '',
        activeTitle: result.activeTitle || '',
        activeUrl: result.activeUrl || '',
        transcriptionProvider: result.transcriptionProvider || 'none',
        sourceLanguage: result.sourceLanguage || 'ja',
        hasGroqApiKey: Boolean(result.groqApiKey),
        translationEnabled: Boolean(result.translationEnabled),
        translationProvider: result.translationProvider || 'google',
        targetLanguage: result.targetLanguage || 'ja'
      });
    });
    return true;
  }

  if (message.type === 'saveSettings') {
    const values = {
      transcriptionProvider: message.transcriptionProvider || 'none',
      sourceLanguage: message.sourceLanguage || 'ja',
      translationEnabled: Boolean(message.translationEnabled),
      translationProvider: message.translationProvider || 'google',
      targetLanguage: message.targetLanguage || 'ja'
    };
    if (message.clearGroqApiKey) {
      values.groqApiKey = '';
    } else if (typeof message.groqApiKey === 'string' && message.groqApiKey.trim()) {
      values.groqApiKey = message.groqApiKey.trim();
    }
    storageSet(values)
      .then(() => storageGet(['groqApiKey']))
      .then((result) => sendResponse({ ok: true, hasGroqApiKey: Boolean(result.groqApiKey) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'transcript') {
    appendTranscript(message.text, message.meta)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'capture-status') {
    if (activeSession?.tabId) sendToTab(activeSession.tabId, { type: 'stream-status', text: message.text });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'capture-stopped') {
    const tabId = activeSession?.tabId || sender.tab?.id;
    activeSession = null;
    storageSet({ isEnabled: false, activeTabId: null, activeUrl: '', activeTitle: '' }).catch(() => {});
    updateBadge(false);
    if (tabId) sendToTab(tabId, { type: 'state-changed', enabled: false });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
