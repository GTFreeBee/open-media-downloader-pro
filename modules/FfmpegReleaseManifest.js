module.exports = Object.freeze({
    version: "6.1",
    baseUrl: "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/",
    platforms: Object.freeze({
        "windows-64": Object.freeze({
            ffmpeg: Object.freeze({ file: "ffmpeg-6.1-win-64.zip", sha256: "b0fb4bcef9d4b5f7a77d2e4854f80d4ce3e43809bc29fd1f97caa1b467f96993" }),
            ffprobe: Object.freeze({ file: "ffprobe-6.1-win-64.zip", sha256: "3c0ea2856cf65edff23a2d4e76b1ceabba65fe8b1bed684ee2eeba24aa9427c3" })
        }),
        "linux-64": Object.freeze({
            ffmpeg: Object.freeze({ file: "ffmpeg-6.1-linux-64.zip", sha256: "8bb4a27f5fd02f3dd9a5e75c9eddf6ace1d50a08929ee0d20bbf17eb467fb711" }),
            ffprobe: Object.freeze({ file: "ffprobe-6.1-linux-64.zip", sha256: "cb690c360042b51d9e901db2b0185c585330c1067b5c5edf0b6a5e26e0375e2a" })
        }),
        "osx-64": Object.freeze({
            ffmpeg: Object.freeze({ file: "ffmpeg-6.1-macos-64.zip", sha256: "ffcd56ce5ef50c4d36d675b0ee80674f5a0869f94746460ff5d058a33cbd3128" }),
            ffprobe: Object.freeze({ file: "ffprobe-6.1-macos-64.zip", sha256: "878ab8787ca6c48a11cb668c01d544be4c1bf655637d719cdf3b3179841545f2" })
        })
    })
});
