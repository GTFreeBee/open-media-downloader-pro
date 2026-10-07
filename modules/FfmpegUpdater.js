const fs = require("fs");
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const os = require("os");
const AdmZip = require("adm-zip");
const Utils = require('./Utils');
const ResumableDownload = require("./ResumableDownload");
const ArtifactVerifier = require("./ArtifactVerifier");
const releaseManifest = require("./FfmpegReleaseManifest");

function buildArtifact(entry) {
    return {
        url: ArtifactVerifier.assertHttpsUrl(releaseManifest.baseUrl + entry.file, ["github.com"]),
        sha256: ArtifactVerifier.normalizeSha256(entry.sha256)
    };
}

class FfmpegUpdater {

    constructor(paths, win) {
        this.paths = paths;
        this.win = win;
        this.action = "Installing";
        this.blockingUi = true;
        this.downloader = new ResumableDownload();
        this.platform = process.platform;
        this.arch = os.arch();
    }

    //Checks for an update and download it if there is.
    async checkUpdate(options = {}) {
        this.blockingUi = options.blockingUi !== false;
        if (await this.checkPreInstalled()) {
            console.log("FFmpeg and FFprobe already installed, skipping auto-install.")
            return false;
        }
        console.log("Checking for a new version of ffmpeg.");
        const hasFallbackBinary = await this.hasUsableBinary();
        const localVersion = await this.getLocalVersion();
        const { ffmpeg, ffprobe, remoteVersion } = await this.getRemoteVersion();
        if(remoteVersion == null) {
            console.log("Unable to check for new updates, ffbinaries.com may be down.");
            return false;
        }
        if(remoteVersion === localVersion) {
            console.log(`ffmpeg was already up-to-date! Version: ${localVersion}`);
            return false;
        }
        if(localVersion == null) {
            console.log("Downloading missing ffmpeg binary.");
        } else {
            console.log(`New version ${remoteVersion} found. Updating...`);
            this.action = "Updating to";
        }
        try {
            this.reportStatus(`Installing/Updating ffmpeg to version: ${remoteVersion}. Preparing...`);
            await this.downloadUpdate(ffmpeg.url, ffmpeg.sha256, remoteVersion, "ffmpeg" + this.getFileExtension());
            this.reportStatus(`Installing/Updating ffprobe to version: ${remoteVersion}. Preparing...`);
            await this.downloadUpdate(ffprobe.url, ffprobe.sha256, remoteVersion, "ffprobe" + this.getFileExtension());
            await this.writeVersionInfo(remoteVersion);
            return true;
        } catch (error) {
            console.error(`ffmpeg update failed: ${error.message}`);
            if (hasFallbackBinary) {
                console.log("Continuing with the last working ffmpeg binaries.");
            }
            return false;
        }
    }

    async checkPreInstalled() {
        try {
            await exec("ffmpeg -version");
            await exec("ffprobe -version");
            return true;
        } catch (e) {
            return false;
        }
    }

    async getRemoteVersion() {
        try {
            const platform = this.getManifestPlatform();
            const release = releaseManifest.platforms[platform];
            if (release == null) {
                throw new Error(`No verified FFmpeg build is available for ${this.platform}/${this.arch}.`);
            }
            return {
                remoteVersion: releaseManifest.version,
                ffmpeg: buildArtifact(release.ffmpeg),
                ffprobe: buildArtifact(release.ffprobe)
            }
        } catch (err) {
            console.error('An error occurred while retrieving the latest ffmpeg version data.')
            if (err.response != null) {
                console.error('Status code: ' + err.response.status);
            }
            return {
                remoteVersion: null,
                ffmpeg: null,
                ffprobe: null,
            }
        }
    }

    async hasUsableBinary() {
        if (await this.checkPreInstalled()) {
            return true;
        }
        try {
            await fs.promises.access(path.join(this.paths.ffmpeg, "ffmpeg" + this.getFileExtension()));
            await fs.promises.access(path.join(this.paths.ffmpeg, "ffprobe" + this.getFileExtension()));
            return true;
        } catch (error) {
            return false;
        }
    }

    //Returns the currently downloaded version of yt-dlp
   async getLocalVersion() {
        let data;
        try {
            const result = await fs.promises.readFile(this.paths.ffmpegVersion, "utf8");
            data = JSON.parse(result);
        } catch (err) {
            if (err.code !== "ENOENT") console.error(err);
            data = null;
        }
        try {
            await fs.promises.access(path.join(this.paths.ffmpeg, "ffmpeg" + this.getFileExtension()));
            await fs.promises.access(path.join(this.paths.ffmpeg, "ffprobe" + this.getFileExtension()));
        } catch(e) {
            data = null;
        }
        if(data == null) {
            return null;
        } else {
            console.log("Current ffmpeg version: " + data.version);
            return data.version;
        }
    }

    //Downloads the file at the given url and saves it to the ffmpeg path.
    async downloadUpdate(url, expectedDigest, version, filename) {
        ArtifactVerifier.assertHttpsUrl(url, ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
        const downloadPath = path.join(this.paths.ffmpeg, "downloads");
        const archivePath = path.join(downloadPath, filename + ".zip");
        const stagingPath = path.join(downloadPath, "staging", filename);
        if (!fs.existsSync(archivePath)) {
            await this.downloader.download(url, archivePath, {
                maxAttempts: 2,
                onProgress: ({ transferred, total }) => {
                    const artifact = filename.replace(".exe", "");
                    const percentage = total == null ? "..." : ((transferred / total) * 100).toFixed(0) + "%";
                    const totalText = total == null ? "unknown size" : Utils.convertBytes(total);
                    this.reportStatus(`${this.action} ${artifact} ${version} - ${percentage} of ${totalText}`);
                },
                onRetry: ({ attempt, maxAttempts, error }) => {
                    const artifact = filename.replace(".exe", "");
                    this.reportStatus(`Retrying ${artifact} download (${attempt}/${maxAttempts}) after: ${error.message}`);
                }
            });
        } else {
            console.log(`Reusing previously downloaded ${filename} archive.`);
        }

        await ArtifactVerifier.verifySha256(archivePath, expectedDigest);

        const artifact = filename.replace(".exe", "");
        this.reportStatus(`${this.action} ${artifact} ${version} - Extracting binaries...`);
        await fs.promises.mkdir(path.dirname(stagingPath), { recursive: true });
        const zipFile = new AdmZip(archivePath, {});
        zipFile.extractEntryTo(filename, path.dirname(stagingPath), false, true, false, filename);
        await ResumableDownload.promoteFile(stagingPath, path.join(this.paths.ffmpeg, filename));
        await fs.promises.rm(archivePath, { force: true });
        await fs.promises.rm(path.join(downloadPath, "staging"), { recursive: true, force: true });
    }

    //Writes the new version number to the ytdlVersion file
    async writeVersionInfo(version) {
        const data = {
            version: version,
        };
        await fs.promises.writeFile(this.paths.ffmpegVersion, JSON.stringify(data));
        console.log("New version data written to ffmpegVersion.");
    }

    getFileExtension() {
        if (this.platform === "win32") return ".exe";
        else return "";
    }

    getManifestPlatform() {
        if (this.arch !== "x64") return null;
        if (this.platform === "win32") return "windows-64";
        if (this.platform === "darwin") return "osx-64";
        if (this.platform === "linux") return "linux-64";
        return null;
    }

    reportStatus(message) {
        if (this.blockingUi && this.win != null) {
            this.win.webContents.send("binaryLock", {lock: true, placeholder: message});
        } else {
            console.log(message);
        }
    }
}

module.exports = FfmpegUpdater;
