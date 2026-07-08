'use strict';

const toggleButton = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const recognitionEngineEl = document.getElementById('recognitionEngine');
const translationEngineEl = document.getElementById('translationEngine');
const targetEl = document.getElementById('target');
const logEl = document.getElementById('log');
const openOptionsButton = document.getElementById('openOptions');
const timerEl = document.getElementById('timer');
const timerEnabledEl = document.getElementById('timerEnabled');
const timerSliderEl = document.getElementById('timerSlider');
const timerValueEl = document.getElementById('timerValue');
const timerCountdownEl = document.getElementById('timerCountdown');

let countdownInterval = null;
let blockedByOtherTab = false;

const RECOGNITION_ENGINE_LABELS = {
  groq: 'Groq Whisper API',
  gemini: 'Google AI Studio (Gemini API)',
  'faster-whisper': 'Faster-Whisper（ローカル）'
};

const TRANSLATION_ENGINE_LABELS = {
  google: 'Google Translate',
  deepl: 'DeepL API',
  gemini: 'Google AI Studio (Gemini API)'
};

// 現在選択中の認識・翻訳エンジンを表示する（未設定・翻訳オフはグレー表示）
function renderEngines(state) {
  const recognitionLabel = RECOGNITION_ENGINE_LABELS[state.transcriptionProvider];
  recognitionEngineEl.textContent = recognitionLabel || '未設定';
  recognitionEngineEl.className = recognitionLabel ? 'engine-name' : 'engine-off';

  if (state.translationEnabled) {
    const translationLabel = TRANSLATION_ENGINE_LABELS[state.translationProvider] || 'Google Translate';
    translationEngineEl.textContent = translationLabel;
    translationEngineEl.className = 'engine-name';
  } else {
    translationEngineEl.textContent = 'オフ';
    translationEngineEl.className = 'engine-off';
  }
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 予約(autoStopEnabled)とカウントダウン中(autoStopAt)を分けて表示する
function renderTimer(state) {
  stopCountdown();
  const autoStopAt = Number(state.autoStopAt) || null;
  const minutes = Number(state.autoStopMinutes) || 10;
  const armed = Boolean(state.autoStopEnabled);
  const counting = Boolean(autoStopAt) && autoStopAt > Date.now();

  timerEnabledEl.checked = armed;
  timerSliderEl.value = minutes;
  timerValueEl.textContent = `${minutes}分`;
  timerEl.classList.toggle('disabled', !armed);

  if (counting) {
    // 取得中でカウントダウン進行中
    timerCountdownEl.hidden = false;
    const tick = () => {
      const remaining = autoStopAt - Date.now();
      if (remaining <= 0) {
        timerCountdownEl.textContent = '停止しています...';
        stopCountdown();
        setTimeout(() => refreshState().catch(() => {}), 1200);
        return;
      }
      timerCountdownEl.textContent = `あと ${formatRemaining(remaining)} で自動停止`;
    };
    tick();
    countdownInterval = setInterval(tick, 1000);
    return;
  }

  if (armed) {
    // 予約済みだが未開始（開始を押すとカウントダウン開始）
    timerCountdownEl.hidden = false;
    timerCountdownEl.textContent = `開始すると ${minutes}分後に自動停止します`;
    return;
  }

  timerCountdownEl.hidden = true;
}

async function refreshState() {
  const [response, [currentTab]] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getState' }),
    chrome.tabs.query({ active: true, currentWindow: true })
  ]);
  if (!response?.ok) return;

  const isEnabled = Boolean(response.enabled);
  blockedByOtherTab = isEnabled && Boolean(response.activeTabId) && response.activeTabId !== currentTab?.id;

  if (blockedByOtherTab) {
    statusEl.textContent = `他のタブで実行中: ${response.activeTitle || ''}`;
    toggleButton.textContent = '開始する';
    toggleButton.disabled = true;
  } else {
    statusEl.textContent = isEnabled ? '起動中' : '停止中';
    toggleButton.textContent = isEnabled ? '停止する' : '開始する';
    toggleButton.disabled = false;
  }

  renderTimer(response);
  renderEngines(response);

  targetEl.textContent = response.activeTitle
    ? `対象: ${response.activeTitle}`
    : 'タブを開いて開始できます';

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
  if (blockedByOtherTab) return;

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
    toggleButton.disabled = blockedByOtherTab;
  }
});

// ドラッグ中はラベルだけ更新する
timerSliderEl.addEventListener('input', () => {
  timerValueEl.textContent = `${timerSliderEl.value}分`;
});

// 値が確定したら分を保存（カウントダウン中なら背景で張り直される）
timerSliderEl.addEventListener('change', async () => {
  const minutes = Number(timerSliderEl.value);
  const response = await chrome.runtime.sendMessage({ type: 'setAutoStopMinutes', minutes });
  if (response?.ok) await refreshState();
});

// チェックは「予約」。取得中ならその場でカウントダウン開始、未開始なら開始待ち
timerEnabledEl.addEventListener('change', async () => {
  const minutes = Number(timerSliderEl.value);
  const response = await chrome.runtime.sendMessage({
    type: 'armAutoStop',
    enabled: timerEnabledEl.checked,
    minutes
  });
  if (response?.ok) await refreshState();
});

openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refreshState().catch((error) => {
  statusEl.textContent = error.message;
});
