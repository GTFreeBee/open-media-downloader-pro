const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const execa = require("execa");
const AdmZip = require("adm-zip");
const ResumableDownload = require("./ResumableDownload");
const ArtifactVerifier = require("./ArtifactVerifier");

class YtDlpJsRuntime {
    constructor(paths, win) {
        this.paths = paths;
        this.win = win;
        this.platform = process.platform;
        this.downloader = new ResumableDownload();
        this.cachedRuntime = null;
        this.cacheResolved = false;
        this.action = "Installing";
        this.blockingUi = false;
    }

    invalidateCache() {
        this.cachedRuntime = null;
        this.cacheResolved = false;
    }

    async getArguments() {
        const runtime = await this.getRuntime();
        if (runtime == null) {
            return [];
        }
        return ["--js-runtimes", `${runtime.name}:${runtime.path}`];
    }

    async getRuntime() {
        if (this.cacheResolved) {
            return this.cachedRuntime;
        }

        this.cachedRuntime = await this.detectRuntime();
        this.cacheResolved = true;
        return this.cachedRuntime;
    }

    async detectRuntime() {
        const candidates = [
            await this.getManagedDenoCandidate(),
            await this.getSystemDenoCandidate(),
            await this.getSystemNodeCandidate()
        ];

        for (const candidate of candidates) {
            if (candidate != null) {
                return candidate;
            }
        }

        return null;
    }

    async checkUpdate(options = {}) {
        this.blockingUi = options.blockingUi === true;

        if (this.platform !== "win32") {
            return false;
        }

        const fallbackRuntime = await this.getRuntime();
        const localVersion = await this.getLocalVersion();
        const remote = await this.getRemoteVersion();

        if (remote.version == null || remote.url == null || remote.digest == null) {
            console.log("Unable to check for a managed JavaScript runtime update.");
            return false;
        }

        if (await this.hasManagedBinary() && localVersion === remote.version) {
            console.log(`Managed JavaScript runtime already up-to-date! Version: ${localVersion}`);
            return false;
        }

        if (localVersion == null) {
            console.log("Downloading managed JavaScript runtime for yt-dlp.");
        } else {
            console.log(`New JavaScript runtime ${remote.version} found. Updating...`);
            this.action = "Updating to";
        }

        try {
            this.reportStatus(`Preparing JavaScript runtime ${remote.version} for yt-dlp...`);
            await this.downloadUpdate(remote.url, remote.version, remote.digest);
            this.invalidateCache();
            return true;
        } catch (error) {
            console.error(`JavaScript runtime update failed: ${error.message}`);
            if (fallbackRuntime != null) {
                console.log("Continuing with the available JavaScript runtime.");
            }
            return false;
        }
    }

    async hasUsableRuntime() {
        return (await this.getRuntime()) != null;
    }

    async hasManagedBinary() {
        try {
            await fs.promises.access(this.paths.jsRuntime);
            return true;
        } catch (error) {
            return false;
        }
    }

    async getLocalVersion() {
        let data = null;

        try {
            const result = await fs.promises.readFile(this.paths.jsRuntimeVersion, "utf8");
            data = JSON.parse(result);
        } catch (error) {
            data = null;
        }

        if (!(await this.hasManagedBinary())) {
            return null;
        }

        return data != null && data.version != null ? data.version : null;
    }

    async getRemoteVersion() {
        const assetName = this.getReleaseAssetName();
        if (assetName == null) {
            return { version: null, url: null, digest: null };
        }

        try {
            const res = await axios.get("https://api.github.com/repos/denoland/deno/releases/latest", {
                headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent": "open-media-downloader-pro"
                },
                timeout: 10000
            });

            const version = (res.data.tag_name || "").replace(/^v/, "");
            const asset = Array.isArray(res.data.assets)
                ? res.data.assets.find((entry) => entry.name === assetName)
                : null;

            return {
                version: version || null,
                url: asset != null
                    ? ArtifactVerifier.assertHttpsUrl(asset.browser_download_url, ["github.com"])
                    : null,
                digest: asset != null ? ArtifactVerifier.normalizeSha256(asset.digest) : null
            };
        } catch (error) {
            console.error("An error occurred while retrieving the latest JavaScript runtime version data.");
            return { version: null, url: null, digest: null };
        }
    }

    getReleaseAssetName() {
        if (this.platform !== "win32") {
            return null;
        }

        if (os.arch() === "x64") {
            return "deno-x86_64-pc-windows-msvc.zip";
        }

        if (os.arch() === "arm64") {
            return "deno-aarch64-pc-windows-msvc.zip";
        }

        return null;
    }

    async downloadUpdate(url, version, expectedDigest) {
        ArtifactVerifier.assertHttpsUrl(url, ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
        const runtimeName = path.basename(this.paths.jsRuntime);
        const downloadPath = path.join(path.dirname(this.paths.jsRuntime), "downloads");
        const archivePath = path.join(downloadPath, path.basename(url));
        const stagingPath = path.join(downloadPath, "staging", runtimeName);
        let lastReportedPercentage = null;

        await this.downloader.download(url, archivePath, {
            maxAttempts: 2,
            onProgress: ({ transferred, total }) => {
                const percentage = total == null ? "..." : ((transferred / total) * 100).toFixed(0) + "%";
                if (percentage === lastReportedPercentage) {
                    return;
                }
                lastReportedPercentage = percentage;
                const totalText = total == null ? "unknown size" : `${Math.ceil(total / (1024 * 1024))} MB`;
                this.reportStatus(`${this.action} JavaScript runtime ${version} - ${percentage} of ${totalText}`);
            },
            onRetry: ({ attempt, maxAttempts, error }) => {
                this.reportStatus(`Retrying JavaScript runtime download (${attempt}/${maxAttempts}) after: ${error.message}`);
            }
        });

        await ArtifactVerifier.verifySha256(archivePath, expectedDigest);

        await fs.promises.mkdir(path.dirname(stagingPath), { recursive: true });
        const zipFile = new AdmZip(archivePath, {});
        zipFile.extractEntryTo(runtimeName, path.dirname(stagingPath), false, true, false, runtimeName);
        await ResumableDownload.promoteFile(stagingPath, this.paths.jsRuntime);
        await this.writeVersionInfo(version);
        await fs.promises.rm(archivePath, { force: true });
        await fs.promises.rm(path.join(downloadPath, "staging"), { recursive: true, force: true });
    }

    async writeVersionInfo(version) {
        await fs.promises.writeFile(this.paths.jsRuntimeVersion, JSON.stringify({
            version: version,
            runtime: "deno"
        }));
    }

    async getManagedDenoCandidate() {
        if (this.paths.jsRuntime == null || !(await this.hasManagedBinary())) {
            return null;
        }

        if (!(await this.isSupportedDeno(this.paths.jsRuntime))) {
            return null;
        }

        return {
            name: "deno",
            path: this.paths.jsRuntime,
            source: "managed"
        };
    }

    async getSystemDenoCandidate() {
        const denoPath = this.resolveCommandPath("deno");
        if (denoPath == null || this.isSamePath(denoPath, this.paths.jsRuntime)) {
            return null;
        }

        if (!(await this.isSupportedDeno(denoPath))) {
            return null;
        }

        return {
            name: "deno",
            path: denoPath,
            source: "system"
        };
    }

    async getSystemNodeCandidate() {
        const nodePath = this.resolveCommandPath("node");
        if (nodePath == null) {
            return null;
        }

        if (!(await this.isSupportedNode(nodePath))) {
            return null;
        }

        return {
            name: "node",
            path: nodePath,
            source: "system"
        };
    }

    resolveCommandPath(command) {
        const pathValue = process.env.PATH || "";
        const pathExtValue = process.platform === "win32"
            ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
            : [""];
        const searchDirs = pathValue.split(path.delimiter).filter(Boolean);
        const hasExplicitExtension = path.extname(command) !== "";

        for (const searchDir of searchDirs) {
            if (hasExplicitExtension) {
                const candidate = path.join(searchDir, command);
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
                continue;
            }

            for (const extension of pathExtValue) {
                const normalizedExtension = process.platform === "win32" ? extension.toLowerCase() : extension;
                const candidate = path.join(searchDir, `${command}${normalizedExtension}`);
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        }

        return null;
    }

    isSamePath(left, right) {
        if (left == null || right == null) {
            return false;
        }

        return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
    }

    async isSupportedDeno(commandPath) {
        const version = await this.getCommandVersion(commandPath);
        return version != null && this.isVersionAtLeast(version, [2, 0, 0]);
    }

    async isSupportedNode(commandPath) {
        const version = await this.getCommandVersion(commandPath);
        return version != null && this.isVersionAtLeast(version, [20, 0, 0]);
    }

    async getCommandVersion(commandPath) {
        try {
            const result = await execa(commandPath, ["--version"]);
            return result.stdout.trim();
        } catch (error) {
            return null;
        }
    }

    isVersionAtLeast(versionString, minimumVersion) {
        const versionMatch = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
        if (versionMatch == null) {
            return false;
        }

        const version = versionMatch.slice(1).map((value) => parseInt(value, 10));
        for (let index = 0; index < minimumVersion.length; index++) {
            if (version[index] > minimumVersion[index]) {
                return true;
            }

            if (version[index] < minimumVersion[index]) {
                return false;
            }
        }

        return true;
    }

    reportStatus(message) {
        if (this.blockingUi && this.win != null) {
            this.win.webContents.send("binaryLock", { lock: true, placeholder: message });
        } else {
            console.log(message);
        }
    }
}

module.exports = YtDlpJsRuntime;
