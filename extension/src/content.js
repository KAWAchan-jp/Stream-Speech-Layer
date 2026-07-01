'use strict';

let overlay = null;
let textNode = null;
let lastTranscriptNode = null;
let translationNode = null;
let dragHandle = null;
let dragState = null;
let isEnabled = false;

const DEFAULT_OVERLAY_OFFSET = 16;

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

let currentStyle = { ...DEFAULT_STYLE };

function applyStyle(style) {
  currentStyle = { ...DEFAULT_STYLE, ...(style || {}) };

  if (overlay) {
    overlay.style.background = `rgba(12,14,18,${currentStyle.backgroundOpacity})`;
  }
  if (textNode) {
    textNode.style.fontSize = `${currentStyle.statusFontSize}px`;
    textNode.style.color = currentStyle.statusColor;
    textNode.style.display = currentStyle.statusVisible ? '' : 'none';
  }
  if (lastTranscriptNode) {
    lastTranscriptNode.style.fontSize = `${currentStyle.transcriptFontSize}px`;
    lastTranscriptNode.style.color = currentStyle.transcriptColor;
    lastTranscriptNode.style.display = currentStyle.transcriptVisible ? '' : 'none';
  }
  if (translationNode) {
    translationNode.style.fontSize = `${currentStyle.translationFontSize}px`;
    translationNode.style.color = currentStyle.translationColor;
    translationNode.style.display = currentStyle.translationVisible ? '' : 'none';
  }
}

async function restoreStyle() {
  const state = await chrome.storage.local.get(['subtitleStyle']);
  applyStyle(state.subtitleStyle);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultPosition() {
  const rect = overlay.getBoundingClientRect();
  return {
    left: Math.max(DEFAULT_OVERLAY_OFFSET, window.innerWidth - rect.width - DEFAULT_OVERLAY_OFFSET),
    top: Math.max(DEFAULT_OVERLAY_OFFSET, window.innerHeight - rect.height - DEFAULT_OVERLAY_OFFSET)
  };
}

function applyOverlayPosition(position) {
  if (!overlay) return;

  const rect = overlay.getBoundingClientRect();
  const left = clamp(
    Number(position?.left) || getDefaultPosition().left,
    DEFAULT_OVERLAY_OFFSET,
    Math.max(DEFAULT_OVERLAY_OFFSET, window.innerWidth - rect.width - DEFAULT_OVERLAY_OFFSET)
  );
  const top = clamp(
    Number(position?.top) || getDefaultPosition().top,
    DEFAULT_OVERLAY_OFFSET,
    Math.max(DEFAULT_OVERLAY_OFFSET, window.innerHeight - rect.height - DEFAULT_OVERLAY_OFFSET)
  );

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

async function restoreOverlayPosition() {
  const state = await chrome.storage.local.get(['subtitleOverlayPosition']);
  applyOverlayPosition(state.subtitleOverlayPosition);
}

function saveOverlayPosition() {
  if (!overlay) return;
  const rect = overlay.getBoundingClientRect();
  chrome.storage.local.set({
    subtitleOverlayPosition: {
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    }
  }).catch(() => {});
}

function startDrag(event) {
  if (!overlay || event.button > 0) return;

  const rect = overlay.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  dragHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveDrag(event) {
  if (!overlay || !dragState || event.pointerId !== dragState.pointerId) return;

  const rect = overlay.getBoundingClientRect();
  const nextLeft = clamp(
    event.clientX - dragState.offsetX,
    DEFAULT_OVERLAY_OFFSET,
    Math.max(DEFAULT_OVERLAY_OFFSET, window.innerWidth - rect.width - DEFAULT_OVERLAY_OFFSET)
  );
  const nextTop = clamp(
    event.clientY - dragState.offsetY,
    DEFAULT_OVERLAY_OFFSET,
    Math.max(DEFAULT_OVERLAY_OFFSET, window.innerHeight - rect.height - DEFAULT_OVERLAY_OFFSET)
  );

  overlay.style.left = `${nextLeft}px`;
  overlay.style.top = `${nextTop}px`;
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState = null;
  saveOverlayPosition();
}

function createOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'stream-speech-layer-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'left:16px',
    'top:16px',
    'z-index:2147483647',
    'width:min(360px,calc(100vw - 32px))',
    'padding:12px',
    'background:rgba(12,14,18,0.88)',
    'color:white',
    'border:1px solid rgba(255,255,255,0.18)',
    'border-radius:8px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.28)',
    'font-size:13px',
    'line-height:1.45',
    'font-family:Arial,sans-serif',
    'pointer-events:auto',
    'user-select:none'
  ].join(';');

  dragHandle = document.createElement('div');
  dragHandle.style.cssText = [
    'height:10px',
    'margin:-4px -4px 8px',
    'border-radius:5px',
    'background:rgba(255,255,255,0.24)',
    'cursor:move'
  ].join(';');
  dragHandle.title = 'ドラッグして移動';
  dragHandle.addEventListener('pointerdown', startDrag);
  dragHandle.addEventListener('pointermove', moveDrag);
  dragHandle.addEventListener('pointerup', endDrag);
  dragHandle.addEventListener('pointercancel', endDrag);
  overlay.appendChild(dragHandle);

  textNode = document.createElement('div');
  textNode.textContent = 'タブ音声を準備中...';
  textNode.style.pointerEvents = 'none';
  overlay.appendChild(textNode);

  lastTranscriptNode = document.createElement('div');
  lastTranscriptNode.style.cssText = [
    'margin-top:8px',
    'font-size:15px',
    'font-weight:700',
    'word-break:break-word',
    'user-select:text'
  ].join(';');
  overlay.appendChild(lastTranscriptNode);

  translationNode = document.createElement('div');
  translationNode.style.cssText = [
    'margin-top:6px',
    'font-size:17px',
    'font-weight:800',
    'word-break:break-word',
    'user-select:text'
  ].join(';');
  overlay.appendChild(translationNode);

  document.body.appendChild(overlay);
  applyStyle(currentStyle);
  applyOverlayPosition();
  restoreOverlayPosition().catch(() => {});
  restoreStyle().catch(() => {});
  return overlay;
}

function removeOverlay() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  textNode = null;
  lastTranscriptNode = null;
  translationNode = null;
  dragHandle = null;
  dragState = null;
}

function setStatus(text) {
  if (!isEnabled) return;
  createOverlay();
  if (textNode) textNode.textContent = text || '';
}

function setTranscript(text, translatedText = '') {
  if (!isEnabled) return;
  createOverlay();
  if (lastTranscriptNode) lastTranscriptNode.textContent = text || '';
  if (translationNode) translationNode.textContent = translatedText || '';
}

function applyEnabledState(enabled) {
  isEnabled = Boolean(enabled);
  if (isEnabled) {
    createOverlay();
    setStatus('タブ音声を取得中...');
  } else {
    removeOverlay();
  }
}

async function syncState() {
  const state = await chrome.storage.local.get(['isEnabled', 'lastTranscript', 'lastTranslation']);
  applyEnabledState(Boolean(state.isEnabled));
  if (state.isEnabled && state.lastTranscript) setTranscript(state.lastTranscript, state.lastTranslation);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if ('isEnabled' in changes) applyEnabledState(Boolean(changes.isEnabled.newValue));
  if ('lastTranscript' in changes && changes.lastTranscript.newValue) {
    chrome.storage.local.get(['lastTranslation']).then((state) => {
      setTranscript(changes.lastTranscript.newValue, state.lastTranslation);
    });
  }
  if ('subtitleOverlayPosition' in changes && overlay) {
    applyOverlayPosition(changes.subtitleOverlayPosition.newValue);
  }
  if ('subtitleStyle' in changes) {
    applyStyle(changes.subtitleStyle.newValue);
  }
});

window.addEventListener('resize', () => {
  if (!overlay) return;
  applyOverlayPosition(overlay.getBoundingClientRect());
  saveOverlayPosition();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'state-changed') {
    applyEnabledState(Boolean(message.enabled));
  }

  if (message.type === 'stream-status') {
    setStatus(message.text || '');
  }

  if (message.type === 'transcript-update') {
    setTranscript(message.text || '', message.translatedText || '');
  }
});

syncState().catch(() => {});
