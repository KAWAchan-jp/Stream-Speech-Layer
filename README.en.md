# Stream Speech Layer

[日本語](README.md) | **English**

> Turn a stream's voice into subtitles, right on the spot.

A Chromium extension for Chrome / Brave that transcribes and translates the audio of any tab in real time, and overlays the subtitles directly onto the page. Works on any site, not just YouTube / Twitch. It also saves a log so you can look back later.

![version](https://img.shields.io/badge/version-0.3.7-1565c0)
![platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Brave-4c8bf5)
![manifest](https://img.shields.io/badge/Manifest-v3-f59e0b)
![status](https://img.shields.io/badge/status-development-9a3412)

## Features

- 🎧 **Captures tab audio directly** — grabs the stream tab's audio itself, not your microphone
- 📝 **Real-time transcription** — recognition via the Groq Whisper API / Gemini API / local Faster-Whisper
- 🌐 **On-the-fly translation** — supports Google Translate / DeepL / Gemini API
- 🈶 **Subtitle overlay on the stream** — freely drag, resize, and style the panel
- 💾 **Transcription log** — keeps the latest 50 entries locally
- ⏰ **Auto-stop timer** — stops automatically after a set time so a stream isn't left running
- 🆓 **Practical on free tiers** — usable daily within the Groq, Gemini, and DeepL free tiers

## Who it's for

- People who want to understand overseas streams with subtitles
- People who want real-time subtitles on any site with audio, not just YouTube / Twitch
- People who want to keep a text record of what was said on a stream
- People who want to try audio translation subtitles for free, without extra cost

## Supported environments

- Chrome
- Brave
- Chromium 116 or later

## Target sites

Works on essentially any site where a tab plays audio, not just YouTube or Twitch (except pages the browser doesn't allow extensions to run on, such as `chrome://` pages or extension stores).

## About permissions

To show the subtitle overlay on any site, the extension requests access to all websites (Chrome shows a "Read and change all your data on all websites" warning at install time). Tab audio is only captured on the tab where the user explicitly presses "Start" in the popup.

## Installation

1. Open `chrome://extensions/` in Chrome or `brave://extensions/` in Brave
2. Enable Developer Mode
3. Choose "Load unpacked"
4. Select the `extension/` directory of this repository

If you use a release ZIP, extract it and select the resulting `extension/` folder.

## Usage

1. Open the page whose audio you want subtitled (not limited to YouTube or Twitch)
2. Click the extension icon in the toolbar to open the popup
3. From the ⚙ button at the top right of the popup, open the settings page and configure the recognition engine, stream audio language, translation, and API keys
4. Return to the popup and press "Start"
5. The subtitle overlay appears on the page

After updating the extension, reload it on the extensions page and refresh the stream page too.

## Screens

### Popup (toolbar icon)

- Start / Stop
- Current status and the target tab
- Auto-stop timer (slider 1–60 min, ON/OFF)
- List of recent transcriptions
- ⚙ button to open the settings page

### Settings page (options)

Configure recognition, translation, API keys, and the subtitle panel's appearance all in one place. You can open it in any of these ways:

- The ⚙ button in the popup
- Right-click the extension icon in the toolbar → "Options"
- The details view in `chrome://extensions/`

Select and checkbox items are **saved immediately when changed**, while API keys are saved by pressing the **"Save" button** after entering them.

## Auto-stop timer

An auto-stop timer so you don't leave a stream running if you doze off or step away. It sits below the Start button in the popup.

- Set **1–60 minutes** (default 10) with the slider, and turn it on/off with the checkbox
- The checkbox is a "reservation": the **countdown starts when you press "Start"** (or right away if capture is already running)
- When the time is up, it **fully stops capture**, not just Groq / DeepL
- The toolbar icon badge shows the remaining time (in minutes, with a red seconds countdown for the last 10 seconds)
- Stopping manually or closing the tab cancels the countdown (the reservation is kept)

Internally it uses `chrome.alarms` so it fires reliably even if the service worker goes idle.

## Implemented features

- Capturing audio from the current tab (works on any site)
- Re-outputting the tab audio
- Chunking audio with MediaRecorder
- Speech recognition via the Groq Whisper API / Google AI Studio (Gemini API) / local Faster-Whisper server
- Translation via the Google Translate / DeepL API / Google AI Studio (Gemini API)
- On-page subtitle overlay
- Dragging and position saving for the subtitle overlay
- Resizing via the bottom-right handle and size saving for the subtitle overlay
- Subtitle panel display settings (per-element font size, color, and visibility; background opacity; reset to defaults)
- Red warning on the reading status when a usage limit error occurs
- Auto-stop timer (fully stops after 1–60 minutes; remaining time shown on the badge; seconds countdown for the last 10 seconds)
- Per-item settings saving (select items auto-save; API keys save individually)
- Recent transcription display in the popup
- Saved-state display for the Groq / Gemini / DeepL API keys
- Chrome / Brave support

## Settings

### Recognition engine

- Not set
- Groq Whisper API
- Google AI Studio (Gemini API)
- Faster-Whisper (local server)

If not set, it goes as far as capturing audio chunks but does not send them to any external speech recognition API.

The Gemini API responds more slowly than Groq. We recommend trying Groq first and using Gemini as a fallback on days when you hit the Groq limit.

#### Faster-Whisper (local server)

Sends audio to a [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) server running on your own PC. No API key needed, no free-tier limits, and audio is never sent outside your machine.

- **An NVIDIA GPU with CUDA support is recommended.** It also works on CPU only, but `large` models won't reach practical speed.
- For setup, the launch command, and GPU usage, see [`uv/README.md`](./uv/README.md) (it also covers how to download [uv](https://docs.astral.sh/uv/)).
- On the extension's settings page, set the server URL (default: `http://127.0.0.1:8765/transcribe`) and the model (`small` / `medium` / `large-v3` / `large-v3-turbo`).
- If the server isn't running or doesn't respond, an error is shown on the reading status.

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
- Google AI Studio (Gemini API)

When both the recognition engine and translation engine are set to Gemini, the extension internally performs transcription and translation in a single Gemini API request. Gemini recognition and translation share the same project quota.

If you use a DeepL Free API key, append `:fx` to the end of the key when saving.

```text
your-deepl-free-api-key:fx
```

For a DeepL Pro API key, `:fx` is not needed.

### API keys

Save and delete each key in its field on the settings page. Links to the key-issuing pages are also provided on the settings page.

- Groq: <https://console.groq.com/keys>
- Gemini: <https://aistudio.google.com/apikey> (free, no credit card required)
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
- **Gemini (speech recognition / translation)**: Uses the Gemini 3.1 Flash Lite model. Free-tier limits vary by model and account (check <https://aistudio.google.com/rate-limit>). When the daily limit is reached, requests stop automatically and reset the next day. Responses are slower than Groq. When Gemini is used for both recognition and translation, both are handled in the same request.
- **DeepL (translation)**: The free tier (DeepL API Free) allows up to 500,000 characters per month. Since subtitles are short sentences, this is usually plenty. This resets monthly rather than daily.

## Handling limit errors

When a usage limit is reached, a red warning appears on the reading status of the subtitle panel.

- **Groq (speech recognition) limit reached**: Switch the recognition engine to Google AI Studio (Gemini API) to resume transcription the same day (responses are slower).
- **Gemini (speech recognition / translation) limit reached**: When the daily limit (RPD) is reached, further requests stop automatically and a notice appears on the subtitle panel. Switch to Groq or Google Translate / DeepL, or wait for the next-day reset.
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
- `autoStopEnabled` / `autoStopMinutes`: the auto-stop timer's reservation state and configured minutes

## External transmission

Only after the user starts it does the extension capture the current stream tab's audio.

Depending on the selected settings, data is sent to the following external services:

- Groq Whisper API: used for speech recognition
- Google AI Studio (Gemini API): used for speech recognition and translation
- Google Translate: used for translation
- DeepL API: used for translation

If you choose Faster-Whisper (local server), audio is sent only to your own PC at `localhost` / `127.0.0.1` and never to an external (internet) service. For safety, the extension refuses to send audio to any URL other than `localhost` / `127.0.0.1`.

API keys are not hard-coded in the extension; the user saves them from the settings page.
