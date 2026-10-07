# Upstream relationship and project provenance

Open Media Downloader Pro is an independently maintained downstream fork of [StefanLobbenmeier/youtube-dl-gui](https://github.com/StefanLobbenmeier/youtube-dl-gui), itself derived from [jely2002/youtube-dl-gui](https://github.com/jely2002/youtube-dl-gui).

## Verifiable ancestry

The repository preserves upstream history. The Open Media Downloader Pro release line begins at upstream tag `v2.5.6` (commit `235c8f9`) and adds its changes as later commits. A maintainer checkout uses these remotes:

```text
origin    https://github.com/GTFreeBee/open-media-downloader-pro.git
upstream  https://github.com/StefanLobbenmeier/youtube-dl-gui.git
```

The GitHub repository was created as a standalone repository before the signing policy was considered, so GitHub may not display its automatic “forked from” banner. The retained commit ancestry, upstream remote, public attribution and comparison instructions make the relationship explicit and independently verifiable. The project will ask SignPath whether this satisfies its visible-fork requirement; it will not represent approval until SignPath confirms it.

To inspect the complete maintained difference:

```text
git fetch upstream
git diff --stat upstream/master..HEAD
git log --left-right --graph upstream/master...HEAD
```

## Independent product changes

This release line is not a renamed binary. The downstream project maintains substantial changes across application behavior, security, reliability, packaging and release engineering, including:

- a new Open Media Downloader Pro identity, application ID, installer and release version line;
- configurable audio/video startup lanes, qualities and formats;
- inline output-basename editing after metadata is available;
- durable settings and interrupted-queue recovery in the operating system's per-user data directory;
- resumable downloads, bounded retries, per-site backoff, staged file promotion and completed-file verification;
- managed yt-dlp, FFmpeg and JavaScript-runtime updates with HTTPS and SHA-256 verification plus last-known-good recovery;
- removal of the inherited application self-updater so upstream releases cannot overwrite this fork;
- hardened Electron renderer boundaries, external navigation handling and diagnostic redaction;
- current dependencies, expanded automated tests, clean packaging and independent GitHub release workflows; and
- user-facing privacy, security, support, contribution, release and third-party licensing documentation.

The detailed history is maintained in [CHANGELOG.md](CHANGELOG.md). All downstream source and build scripts remain under AGPL-3.0-only. Third-party components retain their own licenses and publishers as described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Upstream synchronization policy

Upstream is treated as a source of fixes and ideas, not as an automatic release feed. Maintainers review upstream changes, licensing and compatibility before selectively merging or adapting them. All resulting downstream changes pass this repository's review, test and release controls. Open Media Downloader Pro does not sign or republish an upstream binary as its own.
