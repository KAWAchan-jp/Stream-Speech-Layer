'use strict';

const toggleButton = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const targetEl = document.getElementById('target');
const logEl = document.getElementById('log');
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
const saveSettingsButton = document.getElementById('saveSettings');

function updateKeyStatus(statusEl, clearButton, hasKey) {
  statusEl.textContent = hasKey
    ? '保存済み'
    : '未保存';
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

  const isEnabled = Boolean(response.enabled);
  statusEl.textContent = isEnabled ? '起動中' : '停止中';
  toggleButton.textContent = isEnabled ? '停止する' : '開始する';
  providerEl.value = response.transcriptionProvider || 'none';
  languageEl.value = response.sourceLanguage || 'ja';
  translationEnabledEl.checked = Boolean(response.translationEnabled);
  translationProviderEl.value = response.translationProvider || 'google';
  targetLanguageEl.value = response.targetLanguage || 'ja';
  updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
  updateDeepLKeyStatus(Boolean(response.hasDeepLApiKey));

  targetEl.textContent = response.activeTitle
    ? `対象: ${response.activeTitle}`
    : 'YouTube / Twitch のタブで開始できます';

  logEl.innerHTML = '';
  const logs = response.transcriptLog || [];
  logs.slice().reverse().forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry.translatedText
      ? `${entry.text} → ${entry.translatedText}`
      : entry.text;
    logEl.appendChild(item);
  });
}

toggleButton.addEventListener('click', async () => {
  toggleButton.disabled = true;
  statusEl.textContent = '処理中...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'toggle' });
    if (!response?.ok) {
      statusEl.textContent = response?.error || '開始できませんでした';
      return;
    }
    await refreshState();
  } finally {
    toggleButton.disabled = false;
  }
});

saveSettingsButton.addEventListener('click', async () => {
  saveSettingsButton.disabled = true;
  statusEl.textContent = '設定を保存中...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'saveSettings',
      transcriptionProvider: providerEl.value,
      sourceLanguage: languageEl.value,
      translationEnabled: translationEnabledEl.checked,
      translationProvider: translationProviderEl.value,
      targetLanguage: targetLanguageEl.value,
      deeplApiKey: deeplKeyEl.value,
      groqApiKey: groqKeyEl.value
    });
    if (response?.ok) {
      groqKeyEl.value = '';
      deeplKeyEl.value = '';
      updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
      updateDeepLKeyStatus(Boolean(response.hasDeepLApiKey));
      statusEl.textContent = '設定を保存しました';
    } else {
      statusEl.textContent = response?.error || '保存できませんでした';
    }
  } finally {
    saveSettingsButton.disabled = false;
  }
});

clearGroqKeyButton.addEventListener('click', async () => {
  clearGroqKeyButton.disabled = true;
  statusEl.textContent = 'API キーを削除中...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'saveSettings',
      transcriptionProvider: providerEl.value,
      sourceLanguage: languageEl.value,
      translationEnabled: translationEnabledEl.checked,
      translationProvider: translationProviderEl.value,
      targetLanguage: targetLanguageEl.value,
      clearGroqApiKey: true
    });
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
    const response = await chrome.runtime.sendMessage({
      type: 'saveSettings',
      transcriptionProvider: providerEl.value,
      sourceLanguage: languageEl.value,
      translationEnabled: translationEnabledEl.checked,
      translationProvider: translationProviderEl.value,
      targetLanguage: targetLanguageEl.value,
      clearDeepLApiKey: true
    });
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
