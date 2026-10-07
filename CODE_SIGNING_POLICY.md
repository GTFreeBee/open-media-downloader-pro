# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Scope and current status

This policy covers Windows release installers for Open Media Downloader Pro. An installer is a signed release only when its GitHub Release notes identify the SignPath workflow and Windows reports a valid Authenticode signature issued to SignPath Foundation. Checksums alone do not constitute code signing.

The SignPath application is in preparation. Until approval and configuration are complete, project installers are unsigned and must be labelled accordingly.

## Team roles

The project is currently maintained by one person:

- Committer and reviewer: [GTFreeBee](https://github.com/GTFreeBee)
- Signing approver: [GTFreeBee](https://github.com/GTFreeBee)

Contributions from people without commit access require maintainer review before merge. A release-signing request requires a separate, explicit manual approval after the automated build and tests succeed. Multi-factor authentication is required for repository and SignPath access.

## Privacy

Open Media Downloader Pro has no project-owned analytics, advertising or telemetry. It transfers information to networked systems only when needed for a user-requested media inspection, download or managed tool update. The destinations and locally stored data are described in [PRIVACY.md](PRIVACY.md). Users choose whether to supply cookies and should review diagnostic reports before sharing them.

## Release controls

- Signed binaries must be built on GitHub-hosted runners from this public repository.
- Origin verification must restrict release signing to protected release sources agreed with SignPath.
- The application version, installer version and Git tag must agree.
- The release workflow must run the test, lint and production dependency audit gates before packaging.
- Every signing request requires manual approval in SignPath.
- The signed installer is downloaded from SignPath and verified before publication.
- SHA-256 checksums are generated from the final signed release assets.
- No locally built or previously uploaded binary may replace the workflow artifact.

## Artifact identity

- Product name: `Open Media Downloader Pro`
- Package identifier: `com.glentertainment.open-media-downloader-pro`
- Windows installer: NSIS executable for 64-bit Windows
- Release version source: `package.json`
- Public source repository: <https://github.com/GTFreeBee/open-media-downloader-pro>

The SignPath artifact configuration must enforce the product name and a single consistent version across the installer and nested application executables. Third-party open-source tools downloaded by the application retain their own publishers and must not be signed with this project's certificate.
