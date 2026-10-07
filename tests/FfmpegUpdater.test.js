const fs = require("fs");
const FfmpegUpdater = require("../modules/FfmpegUpdater");

beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
    console.log = jest.fn();
});

describe("FFmpeg release selection", () => {
    it("selects the verified Windows x64 artifacts", async () => {
        const instance = new FfmpegUpdater({});
        instance.platform = "win32";
        instance.arch = "x64";

        const release = await instance.getRemoteVersion();

        expect(release.remoteVersion).toBe("6.1");
        expect(release.ffmpeg.url).toMatch(/^https:\/\/github\.com\//);
        expect(release.ffmpeg.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(release.ffprobe.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it("does not offer an unverified architecture", async () => {
        const instance = new FfmpegUpdater({});
        instance.platform = "win32";
        instance.arch = "arm64";

        await expect(instance.getRemoteVersion()).resolves.toEqual({
            remoteVersion: null,
            ffmpeg: null,
            ffprobe: null
        });
    });
});

describe("FFmpeg update behavior", () => {
    it("keeps the existing binaries when versions match", async () => {
        const instance = new FfmpegUpdater({}, {webContents: {send: jest.fn()}});
        jest.spyOn(instance, "checkPreInstalled").mockResolvedValue(false);
        jest.spyOn(instance, "getLocalVersion").mockResolvedValue("6.1");
        jest.spyOn(instance, "getRemoteVersion").mockResolvedValue({
            remoteVersion: "6.1",
            ffmpeg: {url: "https://github.com/ffmpeg.zip", sha256: "a".repeat(64)},
            ffprobe: {url: "https://github.com/ffprobe.zip", sha256: "b".repeat(64)}
        });
        const download = jest.spyOn(instance, "downloadUpdate");

        await expect(instance.checkUpdate()).resolves.toBe(false);
        expect(download).not.toBeCalled();
    });

    it("downloads both verified artifacts when an update is required", async () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new FfmpegUpdater({}, win);
        jest.spyOn(instance, "checkPreInstalled").mockResolvedValue(false);
        jest.spyOn(instance, "hasUsableBinary").mockResolvedValue(true);
        jest.spyOn(instance, "getLocalVersion").mockResolvedValue("5.0");
        jest.spyOn(instance, "getRemoteVersion").mockResolvedValue({
            remoteVersion: "6.1",
            ffmpeg: {url: "https://github.com/ffmpeg.zip", sha256: "a".repeat(64)},
            ffprobe: {url: "https://github.com/ffprobe.zip", sha256: "b".repeat(64)}
        });
        const download = jest.spyOn(instance, "downloadUpdate").mockResolvedValue(undefined);
        jest.spyOn(instance, "writeVersionInfo").mockResolvedValue(undefined);

        await expect(instance.checkUpdate()).resolves.toBe(true);
        expect(download).toHaveBeenNthCalledWith(1, "https://github.com/ffmpeg.zip", "a".repeat(64), "6.1", `ffmpeg${instance.getFileExtension()}`);
        expect(download).toHaveBeenNthCalledWith(2, "https://github.com/ffprobe.zip", "b".repeat(64), "6.1", `ffprobe${instance.getFileExtension()}`);
    });
});

describe("writeVersionInfo", () => {
    it("writes the selected manifest version", async () => {
        const instance = new FfmpegUpdater({ffmpegVersion: "a/test/path"});
        jest.spyOn(fs.promises, "writeFile").mockResolvedValue(undefined);

        await instance.writeVersionInfo("6.1");

        expect(fs.promises.writeFile).toBeCalledWith("a/test/path", "{\"version\":\"6.1\"}");
    });
});
