# Release process

1. Start from a clean branch with all intended source committed.
2. Run `npm ci`, `npm run verify`, `npm audit --omit=dev --audit-level=high` and a clean platform build.
3. Launch the packaged application and smoke-test first run, metadata, audio, video, cancellation, restart recovery and diagnostics.
4. Update `CHANGELOG.md`, `package.json` and `package-lock.json` to the same semantic version.
5. Confirm the repository's release-signing secrets are configured. Never claim a verified publisher for an unsigned artifact.
6. Create and push an annotated tag such as `v1.0.2`. The tag must match the package version.
7. The Release workflow verifies source, builds each platform, uploads artifacts, creates `SHA256SUMS.txt` and publishes the GitHub Release.
8. Download the published assets, verify their checksums and signatures, install them on clean systems, and then mark the release as stable.

Do not upload an installer produced from an uncommitted working tree. Do not reuse artifacts from an older `dist` directory.
