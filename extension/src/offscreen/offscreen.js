'use strict';

import { transcribeAudioChunk, resetGeminiDailyLimitFlag } from '../transcription/transcriber.js';

let audioContext = null;
let sourceNode = null;
let playbackGainNode = null;
let analyserNode = null;
let mediaRecorder = null;
let captureStream = null;
let chunks = [];
let captureSettings = {};
let currentMeta = {};
let levelTimer = null;
let chunkTimer = null;
let maxLevel = 0;
let hadSpeech = false;

// level: 'info'(通常) | 'warn'(オレンジ) | 'error'(赤)
function sendStatus(text, level = 'info') {
  chrome.runtime.sendMessage({ type: 'capture-status', text, level }).catch(() => {});
}

// 認識エラーを読み取りステータス向けの警告文に変換して通知する
function reportTranscribeError(error) {
  const message = error?.message || String(error);
  if (/\b429\b/.test(message)) {
    sendStatus('⚠ Groqの利用上限に達しました。翌日のリセットまでお待ちください', 'error');
  } else {
    sendStatus(`認識エラー: ${message}`, 'error');
  }
}

function resetChunkState() {
  chunks = [];
  maxLevel = 0;
  hadSpeech = false;
}

function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function startLevelMeter(stream) {
  const meterSource = audioContext.createMediaStreamSource(stream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 512;
  meterSource.connect(analyserNode);

  const buffer = new Uint8Array(analyserNode.frequencyBinCount);
  const threshold = Number(captureSettings.vadThreshold) || 10;

  const sample = () => {
    if (!analyserNode) return;
    analyserNode.getByteFrequencyData(buffer);

    let peak = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] > peak) peak = buffer[index];
    }

    const level = Math.round((peak / 255) * 100);
    if (level > maxLevel) maxLevel = level;
    if (level >= threshold) hadSpeech = true;

    levelTimer = setTimeout(sample, 100);
  };

  sample();
}

function stopLevelMeter() {
  clearTimeout(levelTimer);
  levelTimer = null;
  if (analyserNode) {
    try {
      analyserNode.disconnect();
    } catch (_) {}
  }
  analyserNode = null;
}

function createRecorder(stream) {
  const mimeType = getSupportedMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.onstop = () => {
    const stoppedChunks = chunks;
    const stoppedMimeType = recorder.mimeType || mimeType || stoppedChunks.find((chunk) => chunk.type)?.type || 'audio/webm';
    const wasSpeech = hadSpeech;
    const peakLevel = maxLevel;

    resetChunkState();

    if (captureStream && captureStream.active) {
      mediaRecorder = createRecorder(captureStream);
      startRecorderCycle(mediaRecorder);
    }

    if (!wasSpeech || stoppedChunks.length === 0) {
      sendStatus(`無音チャンクをスキップ (${peakLevel}%)`);
      return;
    }

    const blob = new Blob(stoppedChunks, { type: stoppedMimeType });
    transcribeChunk(blob, stoppedMimeType).catch(reportTranscribeError);
  };

  return recorder;
}

function startRecorderCycle(recorder) {
  const chunkMillis = Number(captureSettings.chunkMillis) || 6000;
  recorder.start();
  clearTimeout(chunkTimer);
  chunkTimer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, chunkMillis);
}

async function transcribeChunk(blob, mimeType) {
  sendStatus(`音声チャンク処理中 (${Math.round(blob.size / 1024)}KB)`);

  const result = await transcribeAudioChunk({
    blob,
    mimeType,
    language: captureSettings.sourceLanguage || 'ja',
    provider: captureSettings.transcriptionProvider || 'none',
    groqApiKey: captureSettings.groqApiKey || '',
    geminiApiKey: captureSettings.geminiApiKey || '',
    translationEnabled: Boolean(captureSettings.translationEnabled),
    translationProvider: captureSettings.translationProvider || 'google',
    targetLanguage: captureSettings.targetLanguage || 'ja'
  });

  if (result.status) sendStatus(result.status, result.level);
  if (!result.text) return;

  await chrome.runtime.sendMessage({
    type: 'transcript',
    text: result.text,
    translatedText: result.translatedText || '',
    translationHandled: Boolean(result.translationHandled),
    meta: currentMeta
  });
}

async function startCapture({ streamId, settings, tabId, url, title }) {
  await stopCapture(false);

  captureSettings = settings || {};
  currentMeta = { tabId, url, source: title || '' };
  sendStatus('タブ音声ストリームを初期化中...');

  captureStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  audioContext = new AudioContext();
  await audioContext.resume();

  sourceNode = audioContext.createMediaStreamSource(captureStream);
  playbackGainNode = audioContext.createGain();
  playbackGainNode.gain.value = 1;
  sourceNode.connect(playbackGainNode);
  playbackGainNode.connect(audioContext.destination);

  startLevelMeter(captureStream);
  resetChunkState();
  // 前回セッションでGeminiのRPD上限フラグが立っていても、新規開始時は再判定させる
  resetGeminiDailyLimitFlag();
  mediaRecorder = createRecorder(captureStream);
  startRecorderCycle(mediaRecorder);
  sendStatus('タブ音声を取得中...');
}

async function stopCapture(notify = true) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.ondataavailable = null;
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  clearTimeout(chunkTimer);
  chunkTimer = null;

  stopLevelMeter();

  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch (_) {}
  }
  sourceNode = null;

  if (playbackGainNode) {
    try {
      playbackGainNode.disconnect();
    } catch (_) {}
  }
  playbackGainNode = null;

  if (captureStream) {
    captureStream.getTracks().forEach((track) => track.stop());
  }
  captureStream = null;
  resetChunkState();

  if (audioContext && audioContext.state !== 'closed') {
    await audioContext.close().catch(() => {});
  }
  audioContext = null;

  if (notify) {
    await chrome.runtime.sendMessage({ type: 'capture-stopped' }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen-capture') return false;

  if (message.type === 'start-capture') {
    startCapture(message)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'stop-capture') {
    stopCapture(false)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
