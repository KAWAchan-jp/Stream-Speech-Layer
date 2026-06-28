'use strict';

const toggleButton = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const targetEl = document.getElementById('target');
const logEl = document.getElementById('log');
const providerEl = document.getElementById('provider');
const languageEl = document.getElementById('language');
const groqKeyEl = document.getElementById('groqKey');
const groqKeyStatusEl = document.getElementById('groqKeyStatus');
const clearGroqKeyButton = document.getElementById('clearGroqKey');
const saveSettingsButton = document.getElementById('saveSettings');

function updateGroqKeyStatus(hasKey) {
  groqKeyStatusEl.textContent = hasKey
    ? '保存済み'
    : '未保存';
  groqKeyStatusEl.classList.toggle('saved', hasKey);
  groqKeyStatusEl.classList.toggle('empty', !hasKey);
  clearGroqKeyButton.disabled = !hasKey;
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'getState' });
  if (!response?.ok) return;

  const isEnabled = Boolean(response.enabled);
  statusEl.textContent = isEnabled ? '起動中' : '停止中';
  toggleButton.textContent = isEnabled ? '停止する' : '開始する';
  providerEl.value = response.transcriptionProvider || 'none';
  languageEl.value = response.sourceLanguage || 'ja';
  updateGroqKeyStatus(Boolean(response.hasGroqApiKey));

  targetEl.textContent = response.activeTitle
    ? `対象: ${response.activeTitle}`
    : 'YouTube / Twitch のタブで開始できます';

  logEl.innerHTML = '';
  const logs = response.transcriptLog || [];
  logs.slice().reverse().forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry.text;
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
      groqApiKey: groqKeyEl.value
    });
    if (response?.ok) {
      groqKeyEl.value = '';
      updateGroqKeyStatus(Boolean(response.hasGroqApiKey));
      statusEl.textContent = response.hasGroqApiKey
        ? '設定を保存しました'
        : '設定を保存しました。Groq API キーは未保存です';
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
      clearGroqApiKey: true
    });
    if (response?.ok) {
      groqKeyEl.value = '';
      updateGroqKeyStatus(false);
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

refreshState().catch((error) => {
  statusEl.textContent = error.message;
});
