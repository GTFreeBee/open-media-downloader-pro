# Contributing

Thank you for improving Open Media Downloader Pro.

## Before starting

- Search existing issues and pull requests.
- Keep each change focused on one problem.
- Do not add tracking, advertising, credential collection or access-control bypasses.
- Preserve upstream attribution and compatible licensing.

## Development checks

Use Node.js 22, install with `npm ci`, and run `npm run verify`. Changes to packaging should also pass `npm run build:dir` on Windows or the equivalent platform build.

Security-sensitive changes need tests covering both accepted and rejected input. Network downloads must use HTTPS, restrict trusted hosts, verify SHA-256 before promotion and preserve a last-known-good executable on failure.

## Pull requests

Describe the user-visible problem, the resulting behavior, validation performed and material limitations. Update the changelog and documentation when behavior changes. CI must pass before review.

By contributing, you agree that your contribution is licensed under AGPL-3.0-only.
