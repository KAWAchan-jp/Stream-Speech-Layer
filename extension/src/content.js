'use strict';

let overlay = null;
let textNode = null;
let lastTranscriptNode = null;

function createOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'stream-speech-layer-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
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
    'pointer-events:none'
  ].join(';');

  textNode = document.createElement('div');
  textNode.textContent = 'タブ音声を準備中...';
  overlay.appendChild(textNode);

  lastTranscriptNode = document.createElement('div');
  lastTranscriptNode.style.cssText = [
    'margin-top:8px',
    'font-size:15px',
    'font-weight:700',
    'word-break:break-word'
  ].join(';');
  overlay.appendChild(lastTranscriptNode);

  document.body.appendChild(overlay);
  return overlay;
}

function removeOverlay() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  textNode = null;
  lastTranscriptNode = null;
}

function setStatus(text) {
  createOverlay();
  if (textNode) textNode.textContent = text || '';
}

function setTranscript(text) {
  createOverlay();
  if (lastTranscriptNode) lastTranscriptNode.textContent = text || '';
}

function applyEnabledState(enabled) {
  if (enabled) {
    createOverlay();
    setStatus('タブ音声を取得中...');
  } else {
    removeOverlay();
  }
}

async function syncState() {
  const state = await chrome.storage.local.get(['isEnabled', 'lastTranscript']);
  applyEnabledState(Boolean(state.isEnabled));
  if (state.isEnabled && state.lastTranscript) setTranscript(state.lastTranscript);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if ('isEnabled' in changes) applyEnabledState(Boolean(changes.isEnabled.newValue));
  if ('lastTranscript' in changes && changes.lastTranscript.newValue) {
    setTranscript(changes.lastTranscript.newValue);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'state-changed') {
    applyEnabledState(Boolean(message.enabled));
  }

  if (message.type === 'stream-status') {
    setStatus(message.text || '');
  }

  if (message.type === 'transcript-update') {
    setTranscript(message.text || '');
  }
});

syncState().catch(() => {});
