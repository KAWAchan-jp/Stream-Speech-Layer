# Stream Speech Layer

[日本語](README.md) | **English**

> Turn a stream's voice into subtitles, right on the spot.

A Chromium extension for Chrome / Brave that transcribes and translates the audio of a YouTube / Twitch stream tab in real time, and overlays the subtitles directly onto the stream. It also saves a log so you can look back later.

![version](https://img.shields.io/badge/version-0.1.0-1565c0)
![platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Brave-4c8bf5)
![manifest](https://img.shields.io/badge/Manifest-v3-f59e0b)
![status](https://img.shields.io/badge/status-development-9a3412)

## Features

- 🎧 **Captures tab audio directly** — grabs the stream tab's audio itself, not your microphone
- 📝 **Real-time transcription** — fast recognition via the Groq Whisper API
- 🌐 **On-the-fly translation** — supports Google Translate / DeepL
- 🈶 **Subtitle overlay on the stream** — freely drag, resize, and style the panel
- 💾 **Transcription log** — keeps the latest 50 entries locally
- 🆓 **Practical on free tiers** — usable daily within the Groq and DeepL free tiers

## Who it's for

- People who want to understand overseas streams with subtitles
- People who want to add real-time subtitles to YouTube / Twitch streams
- People who want to keep a text record of what was said on a stream
- People who want to try audio translation subtitles for free, without extra cost

## Supported environments

- Chrome
- Brave
- Chromium 116 or later

## Target sites

- YouTube / YouTube Live
- Twitch

## Installation

1. Open `chrome://extensions/` in Chrome or `brave://extensions/` in Brave
2. Enable Developer Mode
3. Choose "Load unpacked"
4. Select the `extension/` directory of this repository

If you use a release ZIP, extract it and select the resulting `extension/` folder.

## Usage

1. Open a YouTube or Twitch stream page
2. Click the extension icon in the toolbar to open the popup
3. From the ⚙ button at the top right of the popup, open the settings page and configure the recognition engine, stream audio language, translation, and API keys
4. Return to the popup and press "Start"
5. The subtitle overlay appears on the page

After updating the extension, reload it on the extensions page and refresh the stream page too.

## Screens

### Popup (toolbar icon)

- Start / Stop
- Current status and the target tab
- List of recent transcriptions
- ⚙ button to open the settings page

### Settings page (options)

Configure recognition, translation, API keys, and the subtitle panel's appearance all in one place. You can open it in any of these ways:

- The ⚙ button in the popup
- Right-click the extension icon in the toolbar → "Options"
- The details view in `chrome://extensions/`

Select and checkbox items are **saved immediately when changed**, while API keys are saved by pressing the **"Save" button** after entering them.

## Implemented features

- Capturing audio from the current YouTube / Twitch tab
- Re-outputting the tab audio
- Chunking audio with MediaRecorder
- Speech recognition via the Groq Whisper API
- Translation via the Google Translate / DeepL API
- On-page subtitle overlay
- Dragging and position saving for the subtitle overlay
- Resizing via the bottom-right handle and size saving for the subtitle overlay
- Subtitle panel display settings (per-element font size, color, and visibility; background opacity; reset to defaults)
- Red warning on the reading status when a usage limit error occurs
- Per-item settings saving (select items auto-save; API keys save individually)
- Recent transcription display in the popup
- Saved-state display for the Groq / DeepL API keys
- Chrome / Brave support

## Settings

### Recognition engine

- Not set
- Groq Whisper API

If not set, it goes as far as capturing audio chunks but does not send them to any external speech recognition API.

### Stream audio language

Specify the language spoken on the stream.

- Japanese
- English
- Auto

### Translation

To translate after speech recognition, enable "Translate after speech recognition."

Target languages:

- Japanese
- English
- Korean

Translation engines:

- Google Translate
- DeepL API

If you use a DeepL Free API key, append `:fx` to the end of the key when saving.

```text
your-deepl-free-api-key:fx
```

For a DeepL Pro API key, `:fx` is not needed.

### API keys

Save and delete each key in its field on the settings page. Links to the key-issuing pages are also provided on the settings page.

- Groq: <https://console.groq.com/keys>
- DeepL: <https://www.deepl.com/pro-api> (after registering, find your key in your account settings)

### Subtitle panel display

Under "Subtitle panel display" on the settings page, you can adjust the look of the subtitle overlay. Changes are reflected on the panel instantly.

- Visibility (ON/OFF) of each element (reading status / stream audio transcription / translated text)
- Font size and color of each element
- Opacity of the black background box
- "Reset display settings to defaults" button

The panel can be moved by dragging its top bar and resized with the bottom-right handle; position and size are saved.

## Free-tier estimates

Both can be used daily within their free tiers.

- **Groq (speech recognition)**: Depending on the stream, the free tier is roughly enough for about 1–2 hours of transcription per day (estimate: 2,000 requests/day, 7,200 seconds of audio per hour). The limit resets the next day.
- **DeepL (translation)**: The free tier (DeepL API Free) allows up to 500,000 characters per month. Since subtitles are short sentences, this is usually plenty. This resets monthly rather than daily.

## Handling limit errors

When a usage limit is reached, a red warning appears on the reading status of the subtitle panel.

- **Groq (speech recognition) limit reached**: Since no other recognition engine is implemented, wait until it resets the next day. Transcription is paused until then.
- **DeepL (translation) limit reached**: The translation engine switches to Google Translate (translation quality is lower than DeepL).

## Stored data

Transcription logs are stored in `chrome.storage.local`.

Up to the latest 50 entries are kept. Each time a new recognition result is added, the oldest ones are removed so that only the latest 50 remain.

Main contents saved:

- `text`: speech recognition result
- `translatedText`: translation result
- `source`: stream title, etc.
- `url`: stream URL
- `timestamp`: time of saving

In addition, the following are saved to restore the subtitle overlay:

- `lastTranscript` / `lastTranslation`: the latest recognition and translation results
- `subtitleOverlayPosition` / `subtitleOverlaySize`: the panel's position and size
- `subtitleStyle`: the subtitle panel's display style

## External transmission

Only after the user starts it does the extension capture the current stream tab's audio.

Depending on the selected settings, data is sent to the following external services:

- Groq Whisper API: used for speech recognition
- Google Translate: used for translation
- DeepL API: used for translation

API keys are not hard-coded in the extension; the user saves them from the settings page.
