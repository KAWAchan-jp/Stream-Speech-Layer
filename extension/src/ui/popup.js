'use strict';

const toggleButton = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const targetEl = document.getElementById('target');
const logEl = document.getElementById('log');
const providerEl = document.getElementById('provider');
const languageEl = document.getElementById('language');
const groqKeyEl = document.getElementById('groqKey');
const saveSettingsButton = document.getElementById('saveSettings');

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'getState' });
  if (!response?.ok) return;

  const isEnabled = Boolean(response.enabled);
  statusEl.textContent = isEnabled ? '起動中' : '停止中';
  toggleButton.textContent = isEnabled ? '停止する' : '開始する';
  providerEl.value = response.transcriptionProvider || 'none';
  languageEl.value = response.sourceLanguage || 'ja';

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
    statusEl.textContent = response?.ok ? '設定を保存しました' : response?.error || '保存できませんでした';
  } finally {
    saveSettingsButton.disabled = false;
  }
});

refreshState().catch((error) => {
  statusEl.textContent = error.message;
});
