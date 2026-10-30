# Decisions

Significant decisions about UPlayer, newest first, each with its reasons and the alternatives that were considered. Design choices made before this log was started are described, with their reasons, in the README's "How it works" section.

## 2026-10-30: Windows builds on GitHub Releases, not code-signed

- **Decision**: Each published version gets a `v<version>` tag and a GitHub release with the NSIS installer and the portable `.exe` from `npm run dist`, with their SHA-256 checksums in the release notes. The builds are not code-signed.
- **Why**: People can try UPlayer without installing Node.js or building it, and the binaries stay out of the git history. Before the 0.3.6 upload, its `app.asar` was compared file by file with the build output of the tagged source (identical apart from the `package.json` that electron-builder rewrites).
- **Alternatives considered**: Source only (everyone would have to build it themselves). Code signing would remove the SmartScreen warning, but it needs a paid certificate and is not set up. Publishing through winget or the Microsoft Store would reach more people, but each needs its own manifest or store submission.

## 2026-10-30: Public on GitHub under the MIT license

- **Decision**: The source is published as a public GitHub repository, [ulualtay/UPlayer](https://github.com/ulualtay/UPlayer), and licensed under MIT ([LICENSE](../LICENSE)).
- **Why**: MIT lets anyone use, change and redistribute the code as long as the copyright notice is kept, and it is compatible with every dependency's license (youtubei.js and Electron are MIT, the fonts are OFL-1.1, yt-dlp is Unlicense).
- **Alternatives considered**: GPL-3.0 (anyone who distributes a modified version would have to publish it under the same license), Apache-2.0 (as permissive as MIT, plus an explicit patent grant and a duty to mark changed files), no license (the code would be visible, but nobody could legally reuse it).

## 2026-10-30: What stays out of the repository

- **Decision**: `.gitignore` keeps out `.data/` (the library, history and backups the server writes when it runs from source), everything generated (`node_modules/`, `dist/`, `build/`, `release/`), `.tools/` (yt-dlp), logs, `.env` files and `.claude/settings.local.json`. The maintainer commits with the GitHub `users.noreply.github.com` address.
- **Why**: The repository is public, so it must not carry anyone's listening data, local settings or email address. Generated files are rebuilt by `npm install`, `npm run build` and `npm run dist`, and the installers in `release/` alone take several gigabytes. yt-dlp has its own releases, and the app downloads and updates its copy itself.
- **Alternatives considered**: Committing the installers, or storing them with Git LFS, so the app can be downloaded from the repository. GitHub Releases is the better place for binaries: they stay out of every clone's history.
