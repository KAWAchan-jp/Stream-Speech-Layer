'use strict';

export const CAPTURE_TARGET = 'offscreen-capture';

export function buildStartCaptureMessage({ streamId, tabId, url, title, settings }) {
  return {
    target: CAPTURE_TARGET,
    type: 'start-capture',
    streamId,
    tabId,
    url,
    title,
    settings
  };
}

export function buildStopCaptureMessage() {
  return {
    target: CAPTURE_TARGET,
    type: 'stop-capture'
  };
}
