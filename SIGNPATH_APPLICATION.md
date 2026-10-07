# SignPath Foundation application notes

This document provides the factual project summary for the SignPath Foundation application. Maintainers should update it when the repository or release process changes.

## Project

- Name: Open Media Downloader Pro
- Repository: <https://github.com/GTFreeBee/open-media-downloader-pro>
- License: AGPL-3.0-only
- Maintainer: [GTFreeBee](https://github.com/GTFreeBee)
- Artifact requested for signing: 64-bit Windows NSIS installer (`.exe`)
- Product purpose: a desktop, queue-based interface for user-requested media downloads through yt-dlp
- Revenue model: community open-source project; no proprietary edition, advertising or project-owned analytics

## Maintenance and release state

The project is actively maintained. Its Windows installer is built from the public source and build scripts in this repository. Release functionality and user instructions are documented in [README.md](README.md), release history in [CHANGELOG.md](CHANGELOG.md), and the release gate in [RELEASING.md](RELEASING.md).

The public release requested by SignPath must be identified here before submitting the application:

- Public release URL: **pending first GitHub prerelease**
- Unsigned installer filename: `Open Media Downloader Pro Setup 1.0.2.exe`

## Upstream and independent maintenance

The project is a maintained downstream fork with preserved ancestry from `StefanLobbenmeier/youtube-dl-gui` release `v2.5.6`. GitHub currently presents the repository as standalone because it was created that way before signing preparation. [UPSTREAM.md](UPSTREAM.md) records the remotes, base commit, comparison commands and the independent product changes.

Those changes include the separate product identity and release line, resilient and recoverable download processing, verified managed-tool updates, a managed JavaScript runtime, hardened Electron boundaries, configurable audio/video defaults, output filename editing, diagnostics, expanded tests and an independent release process. The repository does not take an upstream binary and apply this project's signature; GitHub-hosted runners build the installer from this maintained source.

The application should explicitly ask SignPath to confirm whether the documented Git ancestry and visible provenance satisfy the policy's fork requirement. If SignPath requires GitHub's network-level fork flag, the maintainer will coordinate the repository change with GitHub Support before requesting a certificate.

## Policy compliance

- Code signing policy: [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md)
- Privacy policy: [PRIVACY.md](PRIVACY.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Contribution and review policy: [CONTRIBUTING.md](CONTRIBUTING.md)
- Release process: [RELEASING.md](RELEASING.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Repository and SignPath accounts: multi-factor authentication required
- Signing: GitHub trusted build system, origin verification and manual approval for every release

## SignPath configuration requested after approval

- Project slug: `open-media-downloader-pro`
- Artifact configuration slug: `windows-nsis-installer`
- Signing policy slug: `release-signing`
- Allowed origin: this repository's protected release source, as agreed with SignPath
- Required approvals: one manual maintainer approval
- Artifact metadata restriction: product name `Open Media Downloader Pro`; version supplied from `package.json`
