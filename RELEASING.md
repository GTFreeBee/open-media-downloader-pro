# Release process

1. Start from a clean branch with all intended source committed.
2. Run `npm ci`, `npm run verify`, `npm audit --omit=dev --audit-level=high` and a clean platform build.
3. Launch the packaged application and smoke-test first run, metadata, audio, video, cancellation, restart recovery and diagnostics.
4. Update `CHANGELOG.md`, `package.json` and `package-lock.json` to the same semantic version.
5. Confirm the [code signing policy](CODE_SIGNING_POLICY.md) is current. Never claim a verified publisher for an unsigned artifact.
6. For a signed Windows release, dispatch **SignPath Windows release** from `main` or a protected `release/*` branch. Its environment, repository variables and API-token secret must already be configured from the approved SignPath project. Approve the request manually in SignPath only after reviewing the source revision and completed checks.
7. Download the signed workflow artifact and verify its Authenticode signature, product name and version on a clean Windows system.
8. Create and push an annotated tag such as `v1.0.2`. The tag must match the package version.
9. Publish only the verified signed Windows installer. Generate `SHA256SUMS.txt` from the final signed assets, not the unsigned input. Other platform artifacts must be labelled accurately according to their signing status.
10. Download the published assets, verify their checksums and signatures, install them on clean systems, and then mark the release as stable.

Do not upload an installer produced from an uncommitted working tree. Do not reuse artifacts from an older `dist` directory.
