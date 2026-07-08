'use strict';

let overlay = null;
let textNode = null;
let lastTranscriptNode = null;
let translationNode = null;
let dragHandle = null;
let dragState = null;
let resizeHandle = null;
let resizeState = null;
let isEnabled = false;
let ownTabId = null;

const DEFAULT_OVERLAY_OFFSET = 16;
const MIN_OVERLAY_WIDTH = 200;
const MIN_OVERLAY_HEIGHT = 80;

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
// 'info' | 'warn' | 'error'。重要なもの(error)は赤、警告程度(warn)はオレンジで表示する
let statusLevel = 'info';

const STATUS_ERROR_COLOR = '#ff5252';
const STATUS_WARN_COLOR = '#ffb74d';

function statusColorFor(level) {
  if (level === 'error') return STATUS_ERROR_COLOR;
  if (level === 'warn') return STATUS_WARN_COLOR;
  return currentStyle.statusColor;
}

function applyStyle(style) {
  currentStyle = { ...DEFAULT_STYLE, ...(style || {}) };

  if (overlay) {
    overlay.style.background = `rgba(12,14,18,${currentStyle.backgroundOpacity})`;
  }
  if (textNode) {
    textNode.style.fontSize = `${currentStyle.statusFontSize}px`;
    textNode.style.color = statusColorFor(statusLevel);
    textNode.style.fontWeight = statusLevel !== 'info' ? '700' : '';
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

function applyOverlaySize(size) {
  if (!overlay || !size) return;
  if (Number(size.width) > 0) {
    overlay.style.width = `${Math.max(MIN_OVERLAY_WIDTH, Number(size.width))}px`;
  }
  if (Number(size.height) > 0) {
    overlay.style.height = `${Math.max(MIN_OVERLAY_HEIGHT, Number(size.height))}px`;
    overlay.style.overflowY = 'auto';
  }
}

async function restoreOverlaySize() {
  const state = await chrome.storage.local.get(['subtitleOverlaySize']);
  applyOverlaySize(state.subtitleOverlaySize);
}

function saveOverlaySize() {
  if (!overlay) return;
  const rect = overlay.getBoundingClientRect();
  chrome.storage.local.set({
    subtitleOverlaySize: {
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  }).catch(() => {});
}

function startResize(event) {
  if (!overlay || event.button > 0) return;

  const rect = overlay.getBoundingClientRect();
  resizeState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    left: rect.left,
    top: rect.top
  };

  resizeHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveResize(event) {
  if (!overlay || !resizeState || event.pointerId !== resizeState.pointerId) return;

  const maxWidth = window.innerWidth - resizeState.left - DEFAULT_OVERLAY_OFFSET;
  const maxHeight = window.innerHeight - resizeState.top - DEFAULT_OVERLAY_OFFSET;
  const nextWidth = clamp(
    resizeState.startWidth + (event.clientX - resizeState.startX),
    MIN_OVERLAY_WIDTH,
    Math.max(MIN_OVERLAY_WIDTH, maxWidth)
  );
  const nextHeight = clamp(
    resizeState.startHeight + (event.clientY - resizeState.startY),
    MIN_OVERLAY_HEIGHT,
    Math.max(MIN_OVERLAY_HEIGHT, maxHeight)
  );

  overlay.style.width = `${nextWidth}px`;
  overlay.style.height = `${nextHeight}px`;
  overlay.style.overflowY = 'auto';
}

function endResize(event) {
  if (!resizeState || event.pointerId !== resizeState.pointerId) return;
  resizeState = null;
  saveOverlaySize();
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

  resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = [
    'position:absolute',
    'right:2px',
    'bottom:2px',
    'width:14px',
    'height:14px',
    'cursor:nwse-resize',
    'border-right:2px solid rgba(255,255,255,0.5)',
    'border-bottom:2px solid rgba(255,255,255,0.5)',
    'border-bottom-right-radius:6px'
  ].join(';');
  resizeHandle.title = 'ドラッグでサイズ変更';
  resizeHandle.addEventListener('pointerdown', startResize);
  resizeHandle.addEventListener('pointermove', moveResize);
  resizeHandle.addEventListener('pointerup', endResize);
  resizeHandle.addEventListener('pointercancel', endResize);
  overlay.appendChild(resizeHandle);

  document.body.appendChild(overlay);
  applyStyle(currentStyle);
  applyOverlayPosition();
  restoreOverlayPosition().catch(() => {});
  restoreOverlaySize().catch(() => {});
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
  resizeHandle = null;
  resizeState = null;
}

function setStatus(text, level = 'info') {
  if (!isEnabled) return;
  createOverlay();
  statusLevel = level === 'error' || level === 'warn' ? level : 'info';
  if (textNode) {
    textNode.textContent = text || '';
    textNode.style.color = statusColorFor(statusLevel);
    textNode.style.fontWeight = statusLevel !== 'info' ? '700' : '';
  }
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

// content scriptは自分のtabIdを直接参照できないため、backgroundに問い合わせて覚えておく
async function resolveOwnTabId() {
  if (ownTabId !== null) return ownTabId;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-own-tab-id' });
    ownTabId = response?.tabId ?? null;
  } catch (_) {
    ownTabId = null;
  }
  return ownTabId;
}

async function syncState() {
  const tabId = await resolveOwnTabId();
  const state = await chrome.storage.local.get(['isEnabled', 'activeTabId', 'lastTranscript', 'lastTranslation']);
  // isEnabledはタブ非依存のグローバルフラグのため、activeTabIdが自タブと一致する場合のみ表示する
  const isActiveTab = Boolean(state.isEnabled) && state.activeTabId === tabId;
  applyEnabledState(isActiveTab);
  if (isActiveTab && state.lastTranscript) setTranscript(state.lastTranscript, state.lastTranslation);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if ('isEnabled' in changes || 'activeTabId' in changes) syncState().catch(() => {});
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
    // 旧形式(isError)からの互換: level未指定でisError=trueなら赤扱い
    setStatus(message.text || '', message.level || (message.isError ? 'error' : 'info'));
  }

  if (message.type === 'transcript-update') {
    setTranscript(message.text || '', message.translatedText || '');
  }
});

syncState().catch(() => {});
