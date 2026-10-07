# Open Media Downloader Pro

Open Media Downloader Pro is a desktop application for downloading media through a clear, queue-based workflow. It combines yt-dlp with a graphical interface, durable download recovery, verified tool updates, format controls, subtitles, metadata and diagnostics.

## Highlights

- Audio-first and video-first modes with configurable startup, quality and format defaults
- Multiple links, playlists and channels in one queue
- Format, quality, codec, subtitle and output controls
- Inline output filename editing with automatic extension handling
- Interrupted-download journaling and automatic recovery
- Bounded retries, per-site backoff and resumable transfers
- Staged file promotion to reduce partial or false-success downloads
- Local diagnostic logs and copyable failure reports
- SHA-256 verification before managed tools are installed

## Install

Download the installer for your operating system from [GitHub Releases](../../releases). Every release includes `SHA256SUMS.txt`; verify the installer against that file before running it.

On first launch the application may download yt-dlp, FFmpeg and a JavaScript runtime. These downloads use HTTPS and must match the SHA-256 value published in the selected upstream release metadata or the repository's pinned FFmpeg manifest.

Windows may show a SmartScreen warning for unsigned community builds. A release should only be described as signed when its GitHub release notes and file properties identify a verified publisher.

## Use

1. Choose **Audio** or **Video** mode.
2. Paste one or more supported web addresses.
3. Review the queue and adjust quality, format or subtitles when needed.
4. Choose a download folder and start the queue.
5. Open **Diagnostics** from settings if a download repeatedly fails.

Only download media you are legally allowed to access and retain. Website terms and local laws remain the user's responsibility.

## Privacy

The application has no project-owned analytics or advertising. URLs are sent to the selected sites and to the underlying media tools as required to inspect and download content. See [PRIVACY.md](PRIVACY.md) for details.

## Supported systems

Release builds target current 64-bit Windows, macOS and Linux systems. Windows receives the most direct testing. Some sites require a current JavaScript runtime, cookies or account access supplied by the user.

## Troubleshooting

- Update the application and retry the download before filing a report.
- Check that the destination is writable and has enough free space.
- Avoid placing active temporary downloads in a heavily synchronized folder.
- Some sites temporarily rate-limit automated requests; allow the built-in backoff to finish.
- Use **Copy failure report** to create a report with sensitive cookie values excluded.

For further help, see [SUPPORT.md](SUPPORT.md). Please report security issues through the private process in [SECURITY.md](SECURITY.md).

## Development

Requires Node.js 22 and npm.

```text
npm ci
npm run verify
npm start
```

Create a clean platform package with `npm run build:win`, `npm run build:linux` or `npm run build:mac`. Each build removes prior `dist` and coverage output first. Tests and development configuration remain in the source repository but are excluded from packaged applications.

See [CONTRIBUTING.md](CONTRIBUTING.md) for review requirements and [RELEASING.md](RELEASING.md) for the release checklist.

## Credits and licensing

This project is based on [StefanLobbenmeier/youtube-dl-gui](https://github.com/StefanLobbenmeier/youtube-dl-gui), which derives from [jely2002/youtube-dl-gui](https://github.com/jely2002/youtube-dl-gui).

The application source is licensed under [AGPL-3.0-only](LICENSE). Components downloaded or redistributed by the application retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
