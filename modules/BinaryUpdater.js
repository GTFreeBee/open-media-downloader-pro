const axios = require("axios");
const fs = require("fs");
const util = require('util');
const Utils = require('./Utils');
const ResumableDownload = require("./ResumableDownload");
const ArtifactVerifier = require("./ArtifactVerifier");
const exec = util.promisify(require('child_process').exec);

class BinaryUpdater {

    constructor(paths, win) {
        this.paths = paths;
        this.win = win;
        this.action = "Installing";
        this.platform = process.platform;
        this.systemVersion = null;
        this.blockingUi = true;
        this.downloader = new ResumableDownload();
    }

    //Checks for an update and download it if there is.
    async checkUpdate(options = {}) {
        this.blockingUi = options.blockingUi !== false;
        if (await this.checkPreInstalled()) {
            console.log("yt-dlp already installed, skipping auto-install.")
            return false;
        }
        console.log("Checking for a new version of yt-dlp.");
        const hasFallbackBinary = await this.hasUsableBinary();
        const localVersion = await this.getLocalVersion();
        const remote = await this.getRemoteVersion();
        if(remote == null) {
            console.log("Unable to check for new updates, GitHub may be down.");
            return false;
        }
        if(remote.version === localVersion) {
            console.log(`Binaries were already up-to-date! Version: ${localVersion}`);
            return false;
        }
        const remoteUrl = remote.url;
        if(localVersion == null) {
            console.log("Downloading missing yt-dlp binary.");
        } else {
            console.log(`New version ${remote.version} found. Updating...`);
            this.action = "Updating to";
        }
        this.reportStatus(`Updating yt-dlp to version: ${remote.version}. Preparing...`);
        try {
            await this.downloadUpdate(remoteUrl, remote.version, remote.digest);
            this.paths.setPermissions();
            return true;
        } catch (error) {
            console.error(`yt-dlp update failed: ${error.message}`);
            if (hasFallbackBinary) {
                console.log("Continuing with the last working yt-dlp binary.");
            }
            return false;
        }
    }

    async checkPreInstalled() {
        for (const command of ["yt-dlp", "ytdlp"]) {
            try {
                await exec(`${command} --version`);
                return true;
            } catch (error) {
                continue;
            }
        }
        return false;
    }

    async getRemoteVersion() {
        const assetName = this.getBinaryAssetName();
        if (assetName == null) return null;
        try {
            const response = await axios.get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest", {
                headers: { Accept: "application/vnd.github+json", "User-Agent": "open-media-downloader-pro" },
                timeout: 10000
            });
            const asset = Array.isArray(response.data.assets)
                ? response.data.assets.find((entry) => entry.name === assetName)
                : null;
            if (asset == null) return null;
            return {
                version: String(response.data.tag_name || "").replace(/^v/, ""),
                url: ArtifactVerifier.assertHttpsUrl(asset.browser_download_url, ["github.com"]),
                digest: ArtifactVerifier.normalizeSha256(asset.digest)
            };
        } catch (error) {
            console.error('An error occurred while retrieving the latest yt-dlp version data.');
            return null;
        }
    }

    async hasUsableBinary() {
        if (await this.checkPreInstalled()) {
            return true;
        }
        try {
            await fs.promises.access(this.paths.ytdl);
            return true;
        } catch (error) {
            return false;
        }
    }

    getBinaryUrl() {
        const assetName = this.getBinaryAssetName();
        return assetName == null ? null : `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
    }

    getBinaryAssetName() {
        if (this.platform === "win32") return "yt-dlp.exe";
        if (this.platform === "darwin") return "yt-dlp_macos";
        if (this.platform === "linux") return "yt-dlp_linux";
        return null;
    }

    getSystemVersion() {
        if (!this.systemVersion) {
            this.systemVersion = process.getSystemVersion()
        }
        return this.systemVersion;
    }

    //Returns the currently downloaded version of yt-dlp
   async getLocalVersion() {
        let data;
        try {
            const result = await fs.promises.readFile(this.paths.ytdlVersion, "utf8");
            data = JSON.parse(result);
            if (!data.ytdlp) {
                data = null;
            }
        } catch (err) {
            if (err.code !== "ENOENT") console.error(err);
            data = null;
        }
        try {
            await fs.promises.access(this.paths.ytdl);
        } catch(e) {
            data = null;
        }
        if(data == null) {
            return null;
        } else {
            console.log("Current yt-dlp version: " + data.version);
            return data.version;
        }
    }

    //Downloads the file at the given url and saves it to the ytdl path.
    async downloadUpdate(remoteUrl, remoteVersion, expectedDigest) {
        ArtifactVerifier.assertHttpsUrl(remoteUrl, ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
        const stagingPath = `${this.paths.ytdl}.download`;
        await this.downloader.download(remoteUrl, stagingPath, {
            maxAttempts: 2,
            onProgress: ({ transferred, total }) => {
                const percentage = total == null ? "..." : ((transferred / total) * 100).toFixed(0) + "%";
                const totalText = total == null ? "unknown size" : Utils.convertBytes(total);
                this.reportStatus(`${this.action} yt-dlp ${remoteVersion} - ${percentage} of ${totalText}`);
            },
            onRetry: ({ attempt, maxAttempts, error }) => {
                this.reportStatus(`Retrying yt-dlp download (${attempt}/${maxAttempts}) after: ${error.message}`);
            }
        });
        await ArtifactVerifier.verifySha256(stagingPath, expectedDigest);
        await ResumableDownload.promoteFile(stagingPath, this.paths.ytdl);
        await this.writeVersionInfo(remoteVersion);
    }

    //Writes the new version number to the ytdlVersion file
    async writeVersionInfo(version) {
        const data = {
            version: version,
            ytdlp: true
        };
        await fs.promises.writeFile(this.paths.ytdlVersion, JSON.stringify(data));
        console.log("New version data written to ytdlVersion.");
    }

    reportStatus(message) {
        if (this.blockingUi && this.win != null) {
            this.win.webContents.send("binaryLock", {lock: true, placeholder: message});
        } else {
            console.log(message);
        }
    }
}

module.exports = BinaryUpdater;
