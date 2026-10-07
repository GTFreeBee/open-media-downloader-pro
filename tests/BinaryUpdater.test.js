const BinaryUpdater = require("../modules/BinaryUpdater");
const fs = require("fs");
const axios = require("axios");
const ResumableDownload = require("../modules/ResumableDownload");
const ArtifactVerifier = require("../modules/ArtifactVerifier");

beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn().mockImplementation(() => {});
    console.log = jest.fn().mockImplementation(() => {});
})

describe("writeVersionInfo", () => {
    it('writes the version to a file', async () => {
        jest.spyOn(fs.promises, 'writeFile').mockResolvedValue("");
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        await instance.writeVersionInfo("v2.0.0-test1");
        expect(fs.promises.writeFile).toBeCalledWith("a/test/path", "{\"version\":\"v2.0.0-test1\",\"ytdlp\":true}");
    });
});

describe("getLocalVersion", () => {
    it('returns null when when the file does not exist', () => {
        jest.spyOn(fs.promises, 'readFile').mockRejectedValue("ENOTFOUND");
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        return instance.getLocalVersion().then((data) => {
            expect(data).toBe(null);
        });
    });
    it('returns the version property from the json file', () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue("{\"version\": \"v2.0.0-test1\",\"ytdlp\":true}")
        jest.spyOn(fs.promises, 'access').mockResolvedValue("");
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        return instance.getLocalVersion().then((data) => {
            expect(data).toBe("v2.0.0-test1");
        });
    });
    it('returns null when ytdlp is unset or false', () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue("{\"version\": \"v2.0.0-test1\"}")
        jest.spyOn(fs.promises, 'access').mockResolvedValue("");
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        return instance.getLocalVersion().then((data) => {
            expect(data).toBe(null);
        });
    });
});

describe('getRemoteVersion', () => {
    it('returns a null when not redirected', () => {
        const axiosGetSpy = jest.spyOn(axios, 'get').mockRejectedValue({response: {status: 200}});
        const instance = new BinaryUpdater({platform: "win32"});
        instance.platform = "win32";
        return instance.getRemoteVersion().then((data) => {
            expect(data).toEqual(null);
            expect(axiosGetSpy).toBeCalledTimes(1);
        });
    });
    it('returns a null on error', () => {
        const axiosGetSpy = jest.spyOn(axios, 'get').mockRejectedValue({response: null});
        const instance = new BinaryUpdater({platform: "darwin"});
        instance.platform = "darwin";
        instance.systemVersion = "13.0";
        return instance.getRemoteVersion().then((data) => {
            expect(data).toEqual(null);
            expect(axiosGetSpy).toBeCalledTimes(1);
        });
    });
    it('returns the link and the version', () => {
        const binaryUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        const digest = `sha256:${"a".repeat(64)}`;
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
            data: {
                tag_name: "2021.10.10",
                assets: [{name: "yt-dlp.exe", browser_download_url: binaryUrl, digest}]
            }
        });
        const instance = new BinaryUpdater({platform: "win32"});
        instance.platform = "win32";
        expect(instance.getBinaryUrl()).toEqual(binaryUrl);
        return instance.getRemoteVersion().then((data) => {
            expect(data).toEqual({version: "2021.10.10", url: binaryUrl, digest: "a".repeat(64)});
            expect(axiosGetSpy).toBeCalledTimes(1);
        });
    });
});

describe('checkUpdate', () => {
    it('does nothing when local and remote version are the same', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate');
        jest.spyOn(instance, 'checkPreInstalled').mockResolvedValue(false);
        instance.paths.setPermissions = jest.fn();
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("v2.0.0");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue({version: "v2.0.0", url: "https://github.com/tool", digest: "a".repeat(64)});
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).not.toBeCalled();
            expect(instance.win.webContents.send).not.toBeCalled();
        });
    });
    it('does nothing when remote version returned null', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate');
        jest.spyOn(instance, 'checkPreInstalled').mockResolvedValue(false);
        instance.paths.setPermissions = jest.fn();
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("v2.0.0");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue(null);
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).not.toBeCalled();
            expect(instance.win.webContents.send).not.toBeCalled();
        });
    });
    it('downloads the latest remote version when local version is null', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate').mockResolvedValue("");
        jest.spyOn(instance, 'checkPreInstalled').mockResolvedValue(false);
        instance.paths.setPermissions = jest.fn();
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue(null);
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue({version: "v2.0.0", url: "https://github.com/tool", digest: "a".repeat(64)});
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).toBeCalledTimes(1);
            expect(instance.win.webContents.send).toBeCalledTimes(1);
        });
    });
    it('downloads the latest remote version when local version is different', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32", ytdl: "a/path/to"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate').mockResolvedValue("");
        jest.spyOn(instance, 'checkPreInstalled').mockResolvedValue(false);
        instance.paths.setPermissions = jest.fn();
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("2021.03.10");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue({version: "2021.10.10", url: "https://github.com/tool", digest: "a".repeat(64)});
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).toBeCalledTimes(1);
            expect(instance.win.webContents.send).toBeCalledTimes(1);
        });
    });
    it('falls back to the existing binary when the update download fails', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32", ytdl: "a/path/to"}, win);
        jest.spyOn(instance, 'checkPreInstalled').mockResolvedValue(false);
        jest.spyOn(instance, 'hasUsableBinary').mockResolvedValue(true);
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("2021.03.10");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue({version: "2021.10.10", url: "https://github.com/tool", digest: "a".repeat(64)});
        jest.spyOn(instance, 'downloadUpdate').mockRejectedValue(new Error("timeout"));
        return instance.checkUpdate().then((updated) => {
            expect(updated).toBe(false);
        });
    });
});

describe("downloadUpdate", () => {
    it('does not write version info and rejects on error', async () => {
        const instance = new BinaryUpdater({platform: "win32"});
        jest.spyOn(ResumableDownload.prototype, 'download').mockRejectedValue("Test error");
        const versionInfoSpy = jest.spyOn(instance, 'writeVersionInfo').mockImplementation(() => {});
        const actualPromise = instance.downloadUpdate("https://github.com/tool", "v2.0.0", "a".repeat(64));
        await expect(actualPromise).rejects.toEqual("Test error");
        expect(versionInfoSpy).not.toBeCalled();
    });
    it('writes version info and resolves when successful', async () => {
        const instance = new BinaryUpdater({platform: "win32"});
        jest.spyOn(ResumableDownload.prototype, 'download').mockResolvedValue(true);
        jest.spyOn(ArtifactVerifier, 'verifySha256').mockResolvedValue(true);
        jest.spyOn(ResumableDownload, 'promoteFile').mockResolvedValue(undefined);
        const versionInfoSpy = jest.spyOn(instance, 'writeVersionInfo').mockImplementation(() => {});
        const actualPromise = instance.downloadUpdate("https://github.com/tool", "v2.0.0", "a".repeat(64));
        await expect(actualPromise).resolves.toBeUndefined();
        expect(versionInfoSpy).toBeCalledWith("v2.0.0");
    });
});
