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
const saveSettingsButton = document.getElementById('saveSettings');

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

saveSettingsButton.addEventListener('click', async () => {
  saveSettingsButton.disabled = true;
  statusEl.textContent = '設定を保存中...';

  try {
    const response = await chrome.runtime.sendMessage(collectSettings({
      deeplApiKey: deeplKeyEl.value,
      groqApiKey: groqKeyEl.value
    }));
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
