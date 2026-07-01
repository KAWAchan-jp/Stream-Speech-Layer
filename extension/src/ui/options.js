'use strict';

const statusEl = document.getElementById('status');
const providerEl = document.getElementById('provider');
const languageEl = document.getElementById('language');
const translationEnabledEl = document.getElementById('translationEnabled');
const translationProviderEl = document.getElementById('translationProvider');
const targetLanguageEl = document.getElementById('targetLanguage');
const deeplKeyEl = document.getElementById('deeplKey');
const deeplKeyStatusEl = document.getElementById('deeplKeyStatus');
const clearDeepLKeyButton = document.getElementById('clearDeepLKey');
const groqKeyEl = document.getElementById('groqKey');
const groqKeyStatusEl = document.getElementById('groqKeyStatus');
const clearGroqKeyButton = document.getElementById('clearGroqKey');
const saveGroqKeyButton = document.getElementById('saveGroqKey');
const saveDeepLKeyButton = document.getElementById('saveDeepLKey');

const resetStyleButton = document.getElementById('resetStyle');
const backgroundOpacityValueEl = document.getElementById('backgroundOpacityValue');

const DEFAULT_STYLE = {
  statusFontSize: 13,
  statusColor: '#ffffff',
  statusVisible: true,
  transcriptFontSize: 15,
  transcriptColor: '#ffffff',
  transcriptVisible: true,
  translationFontSize: 17,
  translationColor: '#ffffff',
  translationVisible: true,
  backgroundOpacity: 0.88
};

// スタイル設定キー → 入力要素の対応
const STYLE_FIELDS = {
  statusVisible: document.getElementById('statusVisible'),
  statusFontSize: document.getElementById('statusFontSize'),
  statusColor: document.getElementById('statusColor'),
  transcriptVisible: document.getElementById('transcriptVisible'),
  transcriptFontSize: document.getElementById('transcriptFontSize'),
  transcriptColor: document.getElementById('transcriptColor'),
  translationVisible: document.getElementById('translationVisible'),
  translationFontSize: document.getElementById('translationFontSize'),
  translationColor: document.getElementById('translationColor'),
  backgroundOpacity: document.getElementById('backgroundOpacity')
};

function readStyleFromInputs() {
  return {
    statusVisible: STYLE_FIELDS.statusVisible.checked,
    statusFontSize: Number(STYLE_FIELDS.statusFontSize.value) || DEFAULT_STYLE.statusFontSize,
    statusColor: STYLE_FIELDS.statusColor.value || DEFAULT_STYLE.statusColor,
    transcriptVisible: STYLE_FIELDS.transcriptVisible.checked,
    transcriptFontSize: Number(STYLE_FIELDS.transcriptFontSize.value) || DEFAULT_STYLE.transcriptFontSize,
    transcriptColor: STYLE_FIELDS.transcriptColor.value || DEFAULT_STYLE.transcriptColor,
    translationVisible: STYLE_FIELDS.translationVisible.checked,
    translationFontSize: Number(STYLE_FIELDS.translationFontSize.value) || DEFAULT_STYLE.translationFontSize,
    translationColor: STYLE_FIELDS.translationColor.value || DEFAULT_STYLE.translationColor,
    backgroundOpacity: Number(STYLE_FIELDS.backgroundOpacity.value)
  };
}

function fillStyleInputs(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  STYLE_FIELDS.statusVisible.checked = s.statusVisible;
  STYLE_FIELDS.statusFontSize.value = s.statusFontSize;
  STYLE_FIELDS.statusColor.value = s.statusColor;
  STYLE_FIELDS.transcriptVisible.checked = s.transcriptVisible;
  STYLE_FIELDS.transcriptFontSize.value = s.transcriptFontSize;
  STYLE_FIELDS.transcriptColor.value = s.transcriptColor;
  STYLE_FIELDS.translationVisible.checked = s.translationVisible;
  STYLE_FIELDS.translationFontSize.value = s.translationFontSize;
  STYLE_FIELDS.translationColor.value = s.translationColor;
  STYLE_FIELDS.backgroundOpacity.value = s.backgroundOpacity;
  backgroundOpacityValueEl.textContent = Number(s.backgroundOpacity).toFixed(2);
}

// 入力を chrome.storage.local へ保存すると content 側が即時反映する
function saveStyle() {
  const style = readStyleFromInputs();
  backgroundOpacityValueEl.textContent = style.backgroundOpacity.toFixed(2);
  chrome.storage.local.set({ subtitleStyle: style }).catch(() => {});
}

async function restoreStyle() {
  const state = await chrome.storage.local.get(['subtitleStyle']);
  fillStyleInputs(state.subtitleStyle);
}

Object.values(STYLE_FIELDS).forEach((input) => {
  input.addEventListener('input', saveStyle);
  input.addEventListener('change', saveStyle);
});

resetStyleButton.addEventListener('click', () => {
  fillStyleInputs(DEFAULT_STYLE);
  chrome.storage.local.set({ subtitleStyle: { ...DEFAULT_STYLE } }).catch(() => {});
  statusEl.textContent = '表示設定を初期値に戻しました';
});

function updateKeyStatus(statusEl, clearButton, hasKey) {
  statusEl.textContent = hasKey ? '保存済み' : '未保存';
  statusEl.classList.toggle('saved', hasKey);
  statusEl.classList.toggle('empty', !hasKey);
  clearButton.disabled = !hasKey;
}

function updateGroqKeyStatus(hasKey) {
  updateKeyStatus(groqKeyStatusEl, clearGroqKeyButton, hasKey);
}

function updateDeepLKeyStatus(hasKey) {
  updateKeyStatus(deeplKeyStatusEl, clearDeepLKeyButton, hasKey);
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'getState' });
  if (!response?.ok) return;

  providerEl.value = response.transcriptionProvider || 'none';
  languageEl.value = response.sourceLanguage || 'ja';
  translationEnabledEl.checked = Boolean(response.translationEnabled);
  translationProviderEl.value = response.translationProvider || 'google';
  targetLanguageEl.value = response.targetLanguage || 'ja';
  updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
  updateDeepLKeyStatus(Boolean(response.hasDeepLApiKey));
}

function collectSettings(extra = {}) {
  return {
    type: 'saveSettings',
    transcriptionProvider: providerEl.value,
    sourceLanguage: languageEl.value,
    translationEnabled: translationEnabledEl.checked,
    translationProvider: translationProviderEl.value,
    targetLanguage: targetLanguageEl.value,
    ...extra
  };
}

// 選択項目の変更時に、現在のフォーム値をまとめて保存する（キーは含めない）
async function saveCoreSettings(savedLabel) {
  const response = await chrome.runtime.sendMessage(collectSettings());
  if (response?.ok) {
    updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
    updateDeepLKeyStatus(Boolean(response.hasDeepLApiKey));
    statusEl.textContent = `${savedLabel}を保存しました`;
  } else {
    statusEl.textContent = response?.error || '保存できませんでした';
  }
}

// 各セレクト・チェックボックスは変更時に自動保存する
[
  [providerEl, '認識エンジン'],
  [languageEl, '配信音声の言語'],
  [translationEnabledEl, '翻訳の有効/無効'],
  [translationProviderEl, '翻訳エンジン'],
  [targetLanguageEl, '翻訳先言語']
].forEach(([el, label]) => {
  el.addEventListener('change', () => {
    saveCoreSettings(label).catch((error) => {
      statusEl.textContent = error.message;
    });
  });
});

async function saveApiKey({ button, input, keyField, label }) {
  const value = input.value.trim();
  if (!value) {
    statusEl.textContent = `${label}を入力してください`;
    return;
  }

  button.disabled = true;
  statusEl.textContent = `${label}を保存中...`;

  try {
    const response = await chrome.runtime.sendMessage(collectSettings({ [keyField]: value }));
    if (response?.ok) {
      input.value = '';
      updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
      updateDeepLKeyStatus(Boolean(response.hasDeepLApiKey));
      statusEl.textContent = `${label}を保存しました`;
    } else {
      statusEl.textContent = response?.error || '保存できませんでした';
    }
  } finally {
    button.disabled = false;
  }
}

saveGroqKeyButton.addEventListener('click', () => {
  saveApiKey({
    button: saveGroqKeyButton,
    input: groqKeyEl,
    keyField: 'groqApiKey',
    label: 'Groq API キー'
  });
});

saveDeepLKeyButton.addEventListener('click', () => {
  saveApiKey({
    button: saveDeepLKeyButton,
    input: deeplKeyEl,
    keyField: 'deeplApiKey',
    label: 'DeepL API キー'
  });
});

clearGroqKeyButton.addEventListener('click', async () => {
  clearGroqKeyButton.disabled = true;
  statusEl.textContent = 'API キーを削除中...';

  try {
    const response = await chrome.runtime.sendMessage(collectSettings({ clearGroqApiKey: true }));
    if (response?.ok) {
      groqKeyEl.value = '';
      updateGroqKeyStatus(false);
      updateDeepLKeyStatus(Boolean(response.hasDeepLApiKey));
      statusEl.textContent = 'Groq API キーを削除しました';
    } else {
      statusEl.textContent = response?.error || '削除できませんでした';
      await refreshState();
    }
  } finally {
    if (groqKeyStatusEl.classList.contains('saved')) {
      clearGroqKeyButton.disabled = false;
    }
  }
});

clearDeepLKeyButton.addEventListener('click', async () => {
  clearDeepLKeyButton.disabled = true;
  statusEl.textContent = 'DeepL API キーを削除中...';

  try {
    const response = await chrome.runtime.sendMessage(collectSettings({ clearDeepLApiKey: true }));
    if (response?.ok) {
      deeplKeyEl.value = '';
      updateDeepLKeyStatus(false);
      updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
      statusEl.textContent = 'DeepL API キーを削除しました';
    } else {
      statusEl.textContent = response?.error || '削除できませんでした';
      await refreshState();
    }
  } finally {
    if (deeplKeyStatusEl.classList.contains('saved')) {
      clearDeepLKeyButton.disabled = false;
    }
  }
});

refreshState().catch((error) => {
  statusEl.textContent = error.message;
});

restoreStyle().catch(() => {});
