# Third-party notices

Open Media Downloader Pro uses and can download independent third-party components. Each component remains governed by its own license.

| Component | Purpose | License / source |
|---|---|---|
| yt-dlp | Media extraction and downloading | [The Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE) |
| FFmpeg / FFprobe | Media inspection, conversion and merging | The selected builds report GPL version 3 or later; [FFmpeg legal information](https://ffmpeg.org/legal.html) and [source](https://ffmpeg.org/download.html#get-sources) |
| Deno | JavaScript runtime used by current yt-dlp extractors | [MIT](https://github.com/denoland/deno/blob/main/LICENSE.md) |
| Electron | Desktop runtime | [MIT and bundled Chromium notices](https://github.com/electron/electron/blob/main/LICENSE) |
| Bootstrap and Bootstrap Icons | Interface | [MIT](https://github.com/twbs/bootstrap/blob/main/LICENSE) / [MIT](https://github.com/twbs/icons/blob/main/LICENSE) |
| jQuery | Interface behavior | [MIT](https://github.com/jquery/jquery/blob/main/LICENSE.txt) |
| SortableJS | Queue ordering | [MIT](https://github.com/SortableJS/Sortable/blob/master/LICENSE) |

JavaScript dependency licenses are recorded by their installed packages and lockfile. Release maintainers must review the dependency and executable inventory before publishing.

The installer does not embed locally cached managed executables. The application retrieves them from the sources above after installation and verifies their release digest before use.
