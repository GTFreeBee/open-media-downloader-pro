const fs = require("fs");
const os = require("os");
const axios = require("axios");
const execa = require("execa");
const YtDlpJsRuntime = require("../modules/YtDlpJsRuntime");
jest.mock("execa");

beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn().mockImplementation(() => {});
    console.log = jest.fn().mockImplementation(() => {});
});

describe("getArguments", () => {
    it("returns an explicit yt-dlp runtime argument when a runtime is detected", async () => {
        const instance = new YtDlpJsRuntime({ jsRuntime: "binaries/deno.exe" });
        jest.spyOn(instance, "detectRuntime").mockResolvedValue({
            name: "deno",
            path: "binaries/deno.exe"
        });

        await expect(instance.getArguments()).resolves.toEqual([
            "--js-runtimes",
            "deno:binaries/deno.exe"
        ]);
    });

    it("returns an empty argument list when no runtime is detected", async () => {
        const instance = new YtDlpJsRuntime({ jsRuntime: "binaries/deno.exe" });
        jest.spyOn(instance, "detectRuntime").mockResolvedValue(null);

        await expect(instance.getArguments()).resolves.toEqual([]);
    });
});

describe("getRemoteVersion", () => {
    it("returns the latest version and Windows asset url", async () => {
        const archSpy = jest.spyOn(os, "arch").mockReturnValue("x64");
        const instance = new YtDlpJsRuntime({ jsRuntime: "binaries/deno.exe" });
        instance.platform = "win32";
        jest.spyOn(axios, "get").mockResolvedValue({
            data: {
                tag_name: "v2.2.7",
                assets: [
                    {
                        name: "deno-x86_64-pc-windows-msvc.zip",
                        browser_download_url: "https://github.com/deno.zip",
                        digest: `sha256:${"b".repeat(64)}`
                    }
                ]
            }
        });

        await expect(instance.getRemoteVersion()).resolves.toEqual({
            version: "2.2.7",
            url: "https://github.com/deno.zip",
            digest: "b".repeat(64)
        });

        archSpy.mockRestore();
    });
});

describe("runtime detection", () => {
    it("accepts supported system node runtimes", async () => {
        const instance = new YtDlpJsRuntime({ jsRuntime: "binaries/deno.exe" });
        jest.spyOn(instance, "resolveCommandPath").mockReturnValue("C:/node/node.exe");
        execa.mockResolvedValue({ stdout: "v24.13.0" });

        await expect(instance.getSystemNodeCandidate()).resolves.toEqual({
            name: "node",
            path: "C:/node/node.exe",
            source: "system"
        });
    });

    it("rejects outdated system node runtimes", async () => {
        const instance = new YtDlpJsRuntime({ jsRuntime: "binaries/deno.exe" });
        jest.spyOn(instance, "resolveCommandPath").mockReturnValue("C:/node/node.exe");
        execa.mockResolvedValue({ stdout: "v18.20.0" });

        await expect(instance.getSystemNodeCandidate()).resolves.toEqual(null);
    });
});

describe("checkUpdate", () => {
    it("downloads the managed runtime when it is missing", async () => {
        const instance = new YtDlpJsRuntime({
            jsRuntime: "binaries/deno.exe",
            jsRuntimeVersion: "binaries/jsRuntimeVersion"
        });
        instance.platform = "win32";
        jest.spyOn(instance, "getRuntime").mockResolvedValue({
            name: "node",
            path: "C:/node/node.exe",
            source: "system"
        });
        jest.spyOn(instance, "getLocalVersion").mockResolvedValue(null);
        jest.spyOn(instance, "getRemoteVersion").mockResolvedValue({
            version: "2.2.7",
            url: "https://github.com/deno.zip",
            digest: "b".repeat(64)
        });
        jest.spyOn(instance, "hasManagedBinary").mockResolvedValue(false);
        const downloadSpy = jest.spyOn(instance, "downloadUpdate").mockResolvedValue(undefined);

        await expect(instance.checkUpdate()).resolves.toBe(true);
        expect(downloadSpy).toBeCalledWith("https://github.com/deno.zip", "2.2.7", "b".repeat(64));
    });
});

describe("writeVersionInfo", () => {
    it("writes managed runtime version metadata", async () => {
        const instance = new YtDlpJsRuntime({
            jsRuntime: "binaries/deno.exe",
            jsRuntimeVersion: "binaries/jsRuntimeVersion"
        });
        jest.spyOn(fs.promises, "writeFile").mockResolvedValue(undefined);

        await expect(instance.writeVersionInfo("2.2.7")).resolves.toBeUndefined();
        expect(fs.promises.writeFile).toBeCalledWith("binaries/jsRuntimeVersion", "{\"version\":\"2.2.7\",\"runtime\":\"deno\"}");
    });
});
