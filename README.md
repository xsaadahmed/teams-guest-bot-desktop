# Teams Guest Bot (Windows)

Joins a Microsoft Teams meeting the same way a human guest would — by opening the meeting
link in a real browser, typing a display name, and clicking "Join now" — and records whatever
audio plays through that browser to a `.wav` file.

This repository is **Windows-native**: WASAPI loopback capture, Playwright Chromium, and a
local Web UI. No Docker, no WSL2, no virtual display stack.

## Quick start — desktop app (recommended)

Download the latest installer from **[GitHub Releases](https://github.com/xsaadahmed/teams-guest-bot-desktop/releases)**:

- `TeamsGuestBot-Setup-1.0.0.exe` — NSIS installer (recommended)
- `TeamsGuestBot-Portable-1.0.0.exe` — portable single-file build

**First run:** Windows SmartScreen may warn because the build is not code-signed yet. Choose
"More info" → "Run anyway" if you trust this release.

**After install:**

1. Open **Teams Guest Bot** from the Start menu or system tray.
2. Go to **Settings** — set your Teams display name and LLM API key (for AI summaries).
3. Optional: **Settings → Transcription** — refresh to detect faster-whisper if installed in Python.
4. Use **Record** to paste a meeting link and join.

Data is stored under `%APPDATA%\teams-guest-bot\` (recordings, config, browser profile).
Logs: `%APPDATA%\teams-guest-bot\bot.log`.

### What the installer includes

- Electron shell + local HTTP server
- Bundled Playwright Chromium
- WASAPI loopback + Teams dialog helpers
- Web UI and `transcribe/` STT probe scripts

### What you must provide

| Item | Required for |
|------|----------------|
| Teams meeting link | Recording |
| Display name | Guest join |
| LLM API key + gateway | AI summaries |
| Python + faster-whisper | Optional accurate post-meeting transcription |

## Corporate laptop without Release downloads

If you cannot download GitHub Release assets, use the companion **CLI/portable** repository:

**[teams-guest-bot-windows](https://github.com/xsaadahmed/teams-guest-bot-windows)** — `git clone`, `Unpack-Bundle.cmd`, `Start-Bot.cmd`.

See [`deployment/README.md`](deployment/README.md).

## Quick start — development machine

```powershell
npm install
.\windows\build-helper.ps1
npm run build:all
Start-Bot.cmd
```

**Electron dev:**

```powershell
npm run electron:dev
```

**Electron release build (produces `release\TeamsGuestBot-Setup-*.exe`):**

```powershell
npm run electron:build
```

Copy [`.env.example`](.env.example) to `.env` for optional env-based configuration.

**Maintainers:** `npm run build:deployment` builds the portable CLI bundle for the companion
[`teams-guest-bot-windows`](https://github.com/xsaadahmed/teams-guest-bot-windows) repo.

See [`windows/README.md`](windows/README.md) for WASAPI capture details, env vars, and
testing notes.

## Web UI

Use **Record** to paste a meeting link and join; browse **Transcripts**, **Recordings**, and
**AI Summaries** from the sidebar. Set your Teams display name and API keys under **Settings**.

The desktop app uses a compact meeting overlay while recording; the CLI/`Start-Bot.cmd` path
opens the UI in an Edge/Chrome app window instead.

## How this differs from the Graph Calling SDK

| | Graph Calling SDK | This (guest browser join) |
|---|---|---|
| Needs Azure AD app + admin-consented permissions? | Yes | No |
| Needs a Windows VM with public IP/cert/DNS? | Yes | No — runs on a normal Windows PC |
| Subject to the Media Access API's "no persisting media" restriction? | Yes | No |
| How it joins | Authenticated bot via Graph | As an anonymous/guest participant |
| Robustness | Stable (official API) | Depends on Teams' web UI not changing |
| Visible to other participants | Registered bot name | Guest name you choose |

**Microsoft can change the join screen at any time** — if `/join` breaks, fix selectors in
`src/teamsJoin.ts`.

Recording has consent and legal implications — see [`SECURITY.md`](SECURITY.md). The bot
appears by name in the participant list.

## How it gets the audio (Windows)

1. A real (visible, not headless) Chromium browser joins the meeting via Playwright.
2. **WASAPI loopback** (`windows/WasapiLoopbackRecorder`) records what the browser plays
   (remote participants).
3. Your **local microphone** is mixed in separately (your voice is not played back to you, so
   loopback alone would miss it).

Set `WASAPI_NO_MIC=true` for remote-audio-only capture.

## Project layout

```
src/
  server.ts              HTTP API + Web UI static files
  bot.ts                 Browser/recording lifecycle
  browserLaunch.ts       Chromium launch flags
  teamsJoin.ts           Guest join flow
  appPaths.ts            User-data paths (Electron + CLI)
  resources.ts           Packaged native binary paths
  transcriptionEngines.ts  Detect installed STT packages (Settings)
electron/                Desktop shell (tray, overlay IPC)
windows/
  WasapiLoopbackRecorder/  .NET WASAPI loopback helper
  DismissTeamsDialog/      Dismiss Teams protocol prompt
web/                       React Web UI (build → public/)
deployment/                Portable corporate bundle (split zip parts)
transcribe/                Optional post-meeting STT scripts
```

## HTTP API

| Endpoint | Method | Purpose |
|---|---|---|
| `/join` | POST | Join meeting (`meetingUrl`, optional `displayName`) |
| `/leave` | POST | Leave and finalize recording |
| `/status` | GET | `idle` / `joining` / `in_meeting` / `error` |
| `/health` | GET | Liveness probe |
| `/recordings` | GET | List `.wav` files |
| `/transcripts` | GET | List transcript files |
| `/summaries` | POST | Generate AI summary from a transcript |
| `/config` | GET/PUT | Local settings (name, LLM, transcription) |
| `/api/transcription/engines` | GET | Detect installed STT engines |

## Speaker-attributed transcripts

The bot turns on Teams live captions and writes, next to each `.wav`:

- `<name>.transcript.txt` — readable lines with **real speaker names**
- `<name>.captions.json` — structured timeline for merge scripts

### Optional: accurate post-meeting transcription

In **Settings → Transcription**, pick an STT engine already installed in Python on this PC
(faster-whisper or NVIDIA NeMo/Parakeet). The app **does not install** packages — it only
detects what is importable.

On the **Record** page, enable **More Accurate Transcription** before joining. After the
meeting ends, the bot runs `transcribe/transcribe_with_names.py` in the background and writes
`<name>.named_transcript.txt` (verbatim STT text + Teams speaker names).

Manual probe (same logic as Settings):

```powershell
cd transcribe
python detect_engines.py
```

## Troubleshooting

| Problem | What to try |
|---|---|
| SmartScreen blocks installer | Unsigned build — use "More info" → "Run anyway", or wait for a signed release |
| Bot never appears in Teams | Admit from lobby; check meeting link (strip `.rproxy.goskope.com` if present) |
| Join fails: Chromium missing | Reinstall from Releases, or run `npx playwright install chromium` in dev |
| `EPERM` on `playwright-artifacts` in Temp | Fixed automatically — app uses `%APPDATA%\teams-guest-bot\.bot-temp` |
| Port 3000 in use | Bot auto-tries 3001, then 3847 — check `bot.log` for `listening on` |
| No `.transcript.txt` | Captions may not have turned on — see `src/captionTracker.ts` |
| Accurate transcription disabled | Install faster-whisper in Python, refresh Settings |
| Recording is silent | Rebuild WASAPI helper: `.\windows\build-helper.ps1` |
| STT not detected in desktop app | Reinstall latest build (needs `transcribe/` in package) |

## Publishing a release (maintainers)

```powershell
npm run electron:build
# Upload release\TeamsGuestBot-Setup-*.exe and TeamsGuestBot-Portable-*.exe to GitHub Releases
# Or push a v* tag to trigger .github/workflows/release.yml
```

Portable CLI bundle for corporate git-clone users is built separately in
[`teams-guest-bot-windows`](https://github.com/xsaadahmed/teams-guest-bot-windows).

## Further reading

- [`windows/README.md`](windows/README.md) — WASAPI helper, env vars, window visibility
- [`deployment/README.md`](deployment/README.md) — pointer to the CLI/portable repo
- [`SECURITY.md`](SECURITY.md) — reporting issues and recording consent
