# Security

## Reporting vulnerabilities

If you discover a security issue, please open a private report via GitHub Security Advisories on this repository, or contact the maintainers directly. Do not open a public issue for undisclosed vulnerabilities.

## Local-only design

Teams Guest Bot runs entirely on your machine:

- The HTTP server binds to `127.0.0.1` only.
- API keys and settings are stored in your user profile (`%APPDATA%\teams-guest-bot\` when using the desktop app).
- Recordings and transcripts stay on disk unless you copy them elsewhere.

## Recording consent

This tool can record meeting audio and generate transcripts. You are responsible for obtaining consent from meeting participants and complying with applicable laws and organizational policies before recording.

## Unsigned installers

Release builds are not code-signed. Windows SmartScreen may warn on first run. Only download installers from official GitHub Releases for this project.
