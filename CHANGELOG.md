# Changelog

All notable changes to this project are documented here.

## Unreleased

- Documentation: Made the independently maintained downstream-fork relationship, preserved upstream ancestry and substantial product divergence explicit.
- Release engineering: Added the SignPath code-signing policy, application dossier and a manually approved GitHub trusted-build workflow for Windows installers.
- Packaging: Removed the inherited Visual C++ 2010 bootstrapper and unsigned elevation helper from the installer; the current Electron application is self-contained and no longer needs that legacy installation step.

## 1.0.2 — 2026-10-07

- Preferences: Added configurable startup lane, quality and format defaults for both Audio and Video, with automatic migration of existing settings.
- Reliability: Store settings and recovery queues in the operating system's per-user data folder and migrate legacy files so upgrades preserve preferences and interrupted work.
- Reliability: Stop clipboard monitoring from repeatedly stealing keyboard focus, closing dropdowns or clearing text selections.
- Queue: Added an optional inline basename editor after metadata loads, with automatic extensions, cross-platform filename cleanup and recovery support.
- Security: Render remote metadata and logs as text, enforce a strict renderer content policy, sandbox the renderer and restrict external navigation to HTTP and HTTPS.
- Security: Verify yt-dlp and Deno against GitHub release SHA-256 metadata and FFmpeg against a pinned SHA-256 manifest before promotion. Restored HTTPS certificate validation as the default.
- Reliability: Preserve last-known-good managed tools when a download or integrity check fails and use clean build output for every package.
- Release engineering: Added reproducible CI, multi-platform GitHub Release publishing, checksums, signing hooks, version/tag validation and current GitHub Actions.
- Maintenance: Updated Electron, electron-builder and Jest; added focused integrity and navigation tests.
- Documentation: Added installation, privacy, security, support, contribution, release and third-party licensing guidance.

## 1.0.1 — 2026-10-01

- Changed: Removed random browser spoofing and migrated existing spoof settings to automatic; paced metadata requests and reduced the default download concurrency to two.
- Changed: Use buffered UTF-8 output and JSON-encoded after-move paths to verify the exact completed file, including Unicode names, converted audio and indexed duplicates. Reject empty, missing, unrelated and directory results.
- Changed: Use relative output templates with explicit home and temporary paths so partial files stay in app-managed staging. Preserve staged media on promotion failure, propagate file-move errors, and snapshot each job's output settings.
- Changed: Recognise YouTube verification errors even after warnings; preserve all error triggers. Fix running metadata cancellation and prevent cancelled downloads from being marked complete.
- Changed: Serialize and atomically replace recovery journals; wait for queue persistence on exit and prevent multiple app instances sharing that journal.
- Changed: Prefer audio streams for audio conversion and update the Electron 41 patch release, HTTP client and ZIP library.
- Why: Saved failures exposed false file-verification errors and YouTube requests rejected by obsolete browser identities.
- Benefits: Correct completion reporting, safer resumability, clearer failures and fewer unnecessary requests.

## 1.0.0 — 2026-04-11

### 2026-04-11

#### Cancellation and restart safety for queued downloads
- Changed: Made metadata and playlist-fetch jobs properly cancelable, kept the remove button active during metadata-fetch stages, wired stop handling through metadata queries as well as active downloads, blocked cancelled playlist metadata fetches from repopulating the queue later, cleared recovery/staging state when a download is explicitly cancelled, and linked unified playlist parent cards to their recovery actions so cancelling the playlist card also clears resumable state.
- Why: Cancelling during metadata fetching, playlist setup, or from a unified playlist card could still leave background work or resumable state behind, and the metadata-stage UI was still making cancel look unavailable even though that stage also needs to be abortable.
- Benefits: Users can now cancel much more confidently at any stage, including while metadata is still being fetched, and explicit cancels no longer behave like interrupted downloads that should resume later.

#### Audio and video mode toggle defaults
- Changed: Added a prominent mode toggle at the top of the main window, set Audio mode as the startup default, made Audio mode default queue and card downloads to `320k` MP3, and made Video mode default queue and card downloads to `720p` MP4 while keeping the full existing quality and format controls available.
- Why: The app needed a clearer first-run path that makes the common audio and video workflows feel intentional instead of requiring users to keep reconfiguring the same defaults.
- Benefits: The main screen is more polished, switching between audio-first and video-first workflows is faster, and new downloads start from much more sensible defaults without removing advanced control.

#### Download failure diagnostics and sync-safe staging
- Changed: Added persistent interrupted-download journaling with startup auto-resume, delayed live fatal handling until yt-dlp actually exits, introduced per-site backoff and bounded app-level retry/fallback logic, verified completed files before marking jobs done, moved temp/partial files into app-managed staging, added retry-aware file promotion for sync-client locks, cleaned stale staging folders on startup, and added diagnostics actions for opening the diagnostics folder and copying failure reports.
- Why: Some transient download errors were being treated as fatal too early, interrupted jobs were not durable across restarts, and cloud sync activity such as Dropbox can interfere with temp files, renames, and final file promotion inside watched folders.
- Benefits: Downloads now have a much better chance to self-recover during flaky internet, continue after a restart or crash, fall back gracefully when a format path fails, prove the final file is really there before showing success, and leave behind better diagnostics when something still goes wrong.

### 2026-04-02

#### Major rebrand
- Changed: Renamed the app and packaging identity to `Open Media Downloader Pro`, updated the author/publisher to `GlenTertainment`, refreshed user-facing text, and added upstream credits in the app and README.
- Why: The project is moving to a new product identity and needed the visible branding, installer metadata, and repo documentation aligned with that change.
- Benefits: Gives the fork a clean, consistent brand across the app, builds, and docs while still crediting the upstream projects.

#### Rebrand version baseline
- Changed: Reset the fork version to `1.0.0` and replaced the inline settings-footer attribution with a dedicated Credits dialog.
- Why: The rebrand should start from a fresh version baseline, and attribution belongs in a proper credits view rather than cramped footer text.
- Benefits: The app now presents a cleaner, more polished settings footer while keeping fuller upstream and technology credits easy to access.

#### Startup update recovery
- Changed: Reworked startup binary updates so resumable temp downloads, bounded retries/timeouts, and last-known-good fallback binaries are used instead of writing directly into live tool paths.
- Why: Flaky internet could previously leave startup hanging or partially replace required tools in a way that blocked the app.
- Benefits: Existing working binaries stay usable, interrupted downloads can resume, and startup now recovers much more gracefully when the network is unstable.

#### Download resilience hardening
- Changed: Added explicit resumable yt-dlp download flags, smarter retry sleep policies, file-access and fragment retry coverage, and stable temp-folder naming for duplicate-safe downloads.
- Why: User-invoked downloads should recover from short connection drops and partial transfers instead of forcing a full restart from scratch.
- Benefits: Real downloads now have a much better chance of resuming cleanly and surviving flaky internet in a more professional way.

#### YouTube JavaScript runtime support
- Changed: Added a managed yt-dlp JavaScript runtime path, explicit `--js-runtimes` wiring for all yt-dlp calls, and a background Windows Deno fallback downloader.
- Why: Current yt-dlp builds need a supported external JavaScript runtime for full YouTube extraction, and relying on a user having one installed globally is too fragile.
- Benefits: YouTube format extraction is more complete, the runtime warning is removed on supported setups, and packaged builds gain a project-managed compatibility fallback.

#### App self-update removal
- Changed: Removed the built-in Electron app self-updater, deleted the app auto-update setting and startup hooks, removed the `electron-updater` dependency, and switched build/release defaults to `--publish never`.
- Why: This fork must never pull app updates from the original project or any inherited update feed that could overwrite fork-specific fixes and branding.
- Benefits: Packaged builds no longer check for or install upstream app releases, reducing regression risk and making app behavior fully controlled by this fork.

#### Baseline validation
- Changed: Built the untouched `v2.5.6` app from source, launched it, packaged the Windows installer, and launched the packaged executable.
- Why: We needed to prove the local toolchain and packaging flow worked before making project changes.
- Benefits: Gives us a known-good baseline and makes future breakages easier to attribute.

#### Dependency security refresh
- Changed: Upgraded vulnerable direct dependencies and added targeted `npm overrides` to resolve remaining transitive audit findings.
- Why: The original `v2.5.6` dependency tree reported 42 vulnerabilities.
- Benefits: `npm audit` now reports `0 vulnerabilities`, reducing supply-chain risk and cleaning up the install baseline.

#### Modern Electron compatibility
- Changed: Updated the main-process external-link handler to use `webContents.setWindowOpenHandler(...)` instead of the older `new-window` event.
- Why: Newer Electron versions no longer rely on the legacy pattern the same way.
- Benefits: Keeps link handling working on the upgraded Electron runtime and reduces future compatibility issues.

#### Test and tooling compatibility
- Changed: Added `jest.setup.js` and `babel.config.cjs`, and updated Jest config for the newer toolchain.
- Why: The modern Jest/Babel stack needed explicit compatibility glue for this older test suite.
- Benefits: Test runs are stable again, with `16/16` suites and `159/159` tests passing.

#### Packaging config update
- Changed: Updated the Linux desktop metadata structure in `package.json` to the current `electron-builder` schema.
- Why: Newer `electron-builder` rejected the legacy desktop-entry shape, which blocked packaging.
- Benefits: Windows packaging works again on the upgraded build toolchain.

#### Revalidation after upgrades
- Changed: Re-ran install, audit, lint, tests, source launch, Windows packaging, and packaged-app launch after the dependency and tooling updates.
- Why: Security and tooling upgrades are only useful if the app still works end to end.
- Benefits: We now have a secure, tested, packageable baseline to build on.
