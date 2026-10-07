const Query = require("../types/Query")
const path = require("path")
const fs = require("fs");
const crypto = require("crypto");
const Utils = require("../Utils")
const console = require("console");
const DownloadRecoveryPolicy = require("./DownloadRecoveryPolicy");
const FilenameOverride = require("../FilenameOverride");

class DownloadQuery extends Query {
    constructor(url, video, environment, progressBar, playlistMeta) {
        super(environment, video.identifier);
        this.playlistMeta = playlistMeta;
        this.url = url;
        this.video = video;
        this.progressBar = progressBar;
        this.format = video.formats[video.selected_format_index];
        this.lastVerifiedFile = null;
        this.completedFilePath = null;
        this.settings = { ...environment.settings };
    }

    async cancel() {
        super.stop();
        if(this.process != null) await this.process.catch(() => null);
        await this.cleanupCancelledDownload();
    }

    async connect() {
        let downloadFolderPath = this.settings.downloadPath;

        if(this.settings.avoidFailingToSaveDuplicateFileName) {
            downloadFolderPath = this.getResilientDownloadFolder();
        }

        const attemptedFallbacks = new Set();
        const maxAttempts = 3;

        for(let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if(this.stopped) return "killed";
                const waitedMs = await this.environment.siteBackoff.wait(this.url);
                if(this.stopped) return "killed";
                if(waitedMs > 0) {
                    this.environment.logger.log(this.video.identifier, `[recovery] Waiting ${Math.ceil(waitedMs / 1000)}s before retrying ${this.url}`);
                }
                const result = await this.runDownloadAttempt(downloadFolderPath);
                if(result === "killed") {
                    return result;
                }
                if(result === "done") {
                    const verificationError = await this.finalizeSuccessfulDownload(downloadFolderPath);
                    if(verificationError == null) {
                        this.environment.siteBackoff.clear(this.url);
                        return "done";
                    }
                    return verificationError;
                }

                const classification = DownloadRecoveryPolicy.classify(result);
                this.environment.siteBackoff.register(this.url, classification.cooldownMs);
                if(DownloadRecoveryPolicy.shouldFallback(this.video, classification, attemptedFallbacks)) {
                    const fallbackIndex = DownloadRecoveryPolicy.getFallbackFormatIndex(this.video, attemptedFallbacks);
                    attemptedFallbacks.add(fallbackIndex);
                    this.video.selected_format_index = fallbackIndex;
                    this.format = this.video.formats[this.video.selected_format_index];
                    this.environment.logger.log(this.video.identifier, `[recovery] Falling back to ${this.format.getDisplayName()} after ${classification.kind} failure.`);
                    continue;
                }
                if(DownloadRecoveryPolicy.shouldRetry(classification, attempt, maxAttempts)) {
                    const retryDelay = DownloadRecoveryPolicy.getRetryDelay(classification, attempt);
                    this.environment.logger.log(this.video.identifier, `[recovery] Retrying after ${classification.kind} failure in ${Math.ceil(retryDelay / 1000)}s.`);
                    await this.delay(retryDelay);
                    continue;
                }
                return result;
            } catch (exception) {
                return `ERROR: ${exception.message || exception}`;
            }
        }

        return "ERROR: Download failed after exhausting recovery attempts.";
    }

    async runDownloadAttempt(downloadFolderPath) {
        this.completedFilePath = null;
        const args = this.buildArguments(downloadFolderPath);
        let destinationCount = 0;
        let initialReset = false;
        return await this.environment.downloadLimiter.schedule(() => this.start(this.url, args, (liveData) => {
            this.environment.logger.log(this.video.identifier, liveData);
            if(liveData.startsWith("__OMDP_FILE__")) {
                try {
                    const reportedPath = JSON.parse(liveData.slice("__OMDP_FILE__".length));
                    if(typeof reportedPath === "string" && path.isAbsolute(reportedPath)) {
                        this.completedFilePath = reportedPath;
                        this.video.filename = path.basename(reportedPath);
                    }
                } catch (error) {
                    this.environment.logger.log(this.video.identifier, "Could not read completed-file record.");
                }
                return;
            }
            this.video.setFilename(liveData);

            if (!liveData.includes("[download]")) return;

            if (liveData.includes("Destination")) destinationCount += 1;

            if (!initialReset) {
                initialReset = true;
                this.progressBar.reset();
                return;
            }

            if (destinationCount === 2 && !this.video.audioOnly && !this.video.downloadingAudio) {
                this.video.downloadingAudio = true;
                this.progressBar.reset();
                return;
            }

            let liveDataObj;
            try {
                liveDataObj = JSON.parse(liveData.slice(liveData.indexOf('{')));
            } catch(e) {
                return;
            }

            if (typeof liveDataObj !== 'object' || liveDataObj === null) {
                return;
            }

            let percentage;
            if ("fragment_count" in liveDataObj) {
                const completion = Math.min(
                    liveDataObj.downloaded_bytes / liveDataObj.total_bytes_estimate,
                    (liveDataObj.fragment_index + 1) / liveDataObj.fragment_count
                );
                percentage = Math.floor(completion * 100) + "." + (Math.floor(completion * 1000) % 10) + "%";
            } else {
                percentage = liveDataObj._percent_str;
            }

            const speed = liveDataObj._speed_str;
            const eta = liveDataObj.eta >= 0 ? liveDataObj._eta_str : "00:00";

            this.progressBar.updateDownload(percentage, eta, speed, this.video.audioOnly || this.video.downloadingAudio);
        }));
    }

    buildArguments(downloadFolderPath) {
        let args = [];
        const output = FilenameOverride.toOutputTemplate(this.video.filenameOverride) ||
            Utils.resolvePlaylistPlaceholders(this.settings.nameFormat, this.playlistMeta);
        if(path.isAbsolute(output) || output.split(/[\\/]/).includes("..")) {
            throw new Error("The filename template must be relative to the download folder and cannot contain '..'.");
        }
        const PROGRESS_TEMPLATE = '[download] %(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s %(progress)j';
        this.format = this.video.formats != null ? this.video.formats[this.video.selected_format_index] : null;

        if(this.video.audioOnly) {
            let audioQuality = this.video.audioQuality;
            if(audioQuality === "best") {
                audioQuality = "0";
            } else if(audioQuality === "worst") {
                audioQuality = "9";
            }
            const audioOutputFormat = this.settings.audioOutputFormat;
            args = [
                '--extract-audio', '--audio-quality', audioQuality,
                '--ffmpeg-location', this.environment.paths.ffmpeg,
                '--no-mtime',
                '-o', output,
                '--output-na-placeholder', "",
                '--progress-template', PROGRESS_TEMPLATE
            ];
            if(this.video.selectedAudioEncoding !== "none") {
                args.push("-f");
                args.push("bestaudio[acodec=" + this.video.selectedAudioEncoding + "]/bestaudio");
            } else if(audioOutputFormat === "m4a") {
                args.push("-f");
                args.push("bestaudio[ext=m4a]/bestaudio/best");
            } else {
                args.push("-f", "bestaudio/best");
            }
            if(audioOutputFormat !== "none") {
                args.push('--audio-format', audioOutputFormat);
            }
            if(audioOutputFormat === "m4a" || audioOutputFormat === "mp3" || audioOutputFormat === "none") {
                args.push("--embed-thumbnail");
            }
        } else {
            if (this.video.formats.length !== 0) {
                let format;
                const encoding = this.video.selectedEncoding === "none" ? "" : "[vcodec=" + this.video.selectedEncoding + "]";
                const audioEncoding = this.video.selectedAudioEncoding === "none" ? "" : "[acodec=" + this.video.selectedAudioEncoding + "]";
                if(this.video.videoOnly) {
                    format = `
                    bestvideo[height=${this.format.height}][fps=${this.format.fps}][ext=mp4]${encoding}
                    /bestvideo[height=${this.format.height}][fps=${this.format.fps}]${encoding}
                    /bestvideo[height=${this.format.height}][fps=${this.format.fps}]
                    /bestvideo[height=${this.format.height}]
                    /best[height=${this.format.height}]
                    /bestvideo
                    /best`;
                    if (this.format.fps == null) {
                        format = `
                        bestvideo[height=${this.format.height}][ext=mp4]${encoding}
                        /bestvideo[height=${this.format.height}]${encoding}
                        /bestvideo[height=${this.format.height}]
                        /best[height=${this.format.height}]
                        /bestvideo
                        /best`;
                    }
                } else {
                    format = `
                    bestvideo[height=${this.format.height}][fps=${this.format.fps}][ext=mp4]${encoding}+${this.video.audioQuality}audio[ext=m4a]${audioEncoding}
                    /bestvideo[height=${this.format.height}][fps=${this.format.fps}]${encoding}+${this.video.audioQuality}audio${audioEncoding}
                    /bestvideo[height=${this.format.height}][fps=${this.format.fps}]${encoding}+${this.video.audioQuality}audio
                    /bestvideo[height=${this.format.height}][fps=${this.format.fps}]+${this.video.audioQuality}audio
                    /bestvideo[height=${this.format.height}]+${this.video.audioQuality}audio
                    /best[height=${this.format.height}]
                    /bestvideo+bestaudio
                    /best`;
                    if (this.format.fps == null) {
                        format = `
                        bestvideo[height=${this.format.height}][ext=mp4]${encoding}+${this.video.audioQuality}audio[ext=m4a]${audioEncoding}
                        /bestvideo[height=${this.format.height}]${encoding}+${this.video.audioQuality}audio${audioEncoding}
                        /bestvideo[height=${this.format.height}]${encoding}+${this.video.audioQuality}audio
                        /bestvideo[height=${this.format.height}]+${this.video.audioQuality}audio
                        /best[height=${this.format.height}]
                        /bestvideo+bestaudio
                        /best`;
                    }
                }
                args = [
                    "-f", format,
                    "-o", output,
                    '--ffmpeg-location', this.environment.paths.ffmpeg,
                    '--no-mtime',
                    '--output-na-placeholder', "",
                    '--progress-template', PROGRESS_TEMPLATE
                ];
            } else {
                args = [
                    "-o", output,
                    '--ffmpeg-location', this.environment.paths.ffmpeg,
                    '--no-mtime',
                    '--output-na-placeholder', "",
                    '--progress-template', PROGRESS_TEMPLATE
                ];
            }
            if (this.video.downloadSubs && this.video.subLanguages.length > 0) {
                this.progressBar.setInitial("Downloading subtitles");
                args.push("--write-sub");
                args.push("--write-auto-sub");
                args.push("--embed-subs");
                args.push("--sub-lang");
                let langs = "";
                this.video.subLanguages.forEach(lang => langs += lang + ",");
                args.push(langs.slice(0, -1));
            }
            if (this.settings.outputFormat !== "none") {
                args.push("--merge-output-format");
                args.push(this.settings.outputFormat);
            }
        }
        if(this.settings.downloadMetadata) {
            args.push('--add-metadata');
        }
        if(this.settings.compatFilename) {
            args.push('--restrict-filenames');
        }
        if(this.settings.downloadThumbnail) {
            args.push('--write-thumbnail');
        }
        if(this.settings.sponsorblockMark !== "") {
            args.push("--sponsorblock-mark");
            args.push(this.settings.sponsorblockMark);
        }

        if(this.settings.sponsorblockRemove !== "") {
            args.push("--sponsorblock-remove");
            args.push(this.settings.sponsorblockRemove);
        }

        if(this.settings.keepUnmerged || this.settings.avoidFailingToSaveDuplicateFileName) {
            args.push('--keep-video');
        }

        this.addResilienceArguments(args);
        this.addManagedPathArguments(args, downloadFolderPath);
        args.push('--newline', '--no-simulate', '--progress', '--print', 'after_move:__OMDP_FILE__%(filepath)j');
        return args;
    }

    addResilienceArguments(args) {
        args.push('--continue');
        args.push('--part');
        args.push('--socket-timeout');
        args.push('30');

        if(this.settings.retries) {
            args.push('--retries');
            args.push(this.settings.retries);
            args.push('--fragment-retries');
            args.push(this.settings.retries);
        }

        if(this.settings.fileAccessRetries) {
            args.push('--file-access-retries');
            args.push(this.settings.fileAccessRetries);
        }

        args.push('--retry-sleep');
        args.push('linear=1:10:2');
        args.push('--retry-sleep');
        args.push('fragment:exp=1:20');
        args.push('--retry-sleep');
        args.push('file_access:linear=1:5:1');
        args.push('--retry-sleep');
        args.push('extractor:linear=1:10:2');
    }

    addManagedPathArguments(args, downloadFolderPath) {
        args.push('--paths');
        args.push(`temp:${this.getTemporaryDownloadFolder()}`);
        args.push('--paths', `home:${path.resolve(downloadFolderPath)}`);
    }

    getResilientDownloadFolder() {
        return path.join(this.getManagedDownloadRoot(), "output");
    }

    getTemporaryDownloadFolder() {
        return path.join(this.getManagedDownloadRoot(), "temp");
    }

    getManagedDownloadRoot() {
        return path.join(this.environment.app.getPath("userData"), "download-staging", this.getResilientDownloadKey());
    }

    getStagingKey() {
        return this.getResilientDownloadKey();
    }

    getResilientDownloadKey() {
        const selectedFormat = this.video.formats[this.video.selected_format_index] || {};
        const keyPayload = {
            url: this.url,
            downloadPath: this.settings.downloadPath,
            audioOnly: this.video.audioOnly,
            videoOnly: this.video.videoOnly,
            audioQuality: this.video.audioQuality,
            selectedEncoding: this.video.selectedEncoding,
            selectedAudioEncoding: this.video.selectedAudioEncoding,
            selectedHeight: selectedFormat.height,
            selectedFps: selectedFormat.fps,
            outputFormat: this.settings.outputFormat,
            audioOutputFormat: this.settings.audioOutputFormat,
            nameFormat: this.settings.nameFormat,
            nameFormatMode: this.settings.nameFormatMode,
            filenameOverride: this.video.filenameOverride
        };

        return crypto.createHash("sha1")
            .update(JSON.stringify(keyPayload))
            .digest("hex")
            .slice(0, 16);
    }

    async cleanupCancelledDownload() {
        await this.removeVideoDataFolder(this.getManagedDownloadRoot());
        await this.removePartialArtifacts(this.settings.downloadPath);

        if(this.settings.avoidFailingToSaveDuplicateFileName) {
            await this.removePartialArtifacts(this.getResilientDownloadFolder());
        }
    }

    async removePartialArtifacts(folderPath) {
        if(folderPath == null) {
            return;
        }

        let files;
        try {
            files = await fs.promises.readdir(folderPath);
        } catch (error) {
            return;
        }

        const expectedNames = new Set();
        if(this.video.filename != null) {
            expectedNames.add(this.video.filename);
        }
        if(typeof this.video.getFilename === "function") {
            const derivedName = this.video.getFilename();
            if(derivedName != null) {
                expectedNames.add(derivedName);
            }
        }

        const expectedStems = [...expectedNames]
            .filter((name) => name != null && name.length > 0)
            .map((name) => path.basename(name, path.extname(name)).toLowerCase());

        if(expectedStems.length === 0) {
            return;
        }

        for(const file of files) {
            const lower = file.toLowerCase();
            const stem = path.basename(file, path.extname(file)).toLowerCase();
            const hasKnownTempExtension = lower.endsWith(".part") ||
                lower.endsWith(".ytdl") ||
                lower.endsWith(".tmp") ||
                lower.endsWith(".temp");
            const isSidecarMetadata = lower.endsWith(".json") &&
                (lower.includes(".part") || lower.includes(".temp"));

            if(!hasKnownTempExtension && !isSidecarMetadata) {
                continue;
            }

            if(!expectedStems.some((expectedStem) => stem === expectedStem || stem.startsWith(expectedStem + "."))) {
                continue;
            }

            await fs.promises.rm(path.join(folderPath, file), { force: true });
        }
    }

    async removeThumbnail(extension) {
        const filename = this.video.filename;
        if(filename != null) {
            const filenameExt = path.basename(filename, path.extname(filename)) + extension;
            const filenameAbs = path.join(this.video.downloadedPath, filenameExt);
            try {
                await fs.promises.unlink(filenameAbs);
            } catch(e) {
                console.log("No left-over thumbnail found to remove. (" + filenameExt + ")")
                if(extension !== ".webp") {
                    await this.removeThumbnail(".webp");
                }
            }
        }
    }

    async finalizeSuccessfulDownload(downloadFolderPath) {
        if(this.stopped) return "killed";
        let verifiedFile = await this.verifyCompletedDownload(downloadFolderPath);
        if(verifiedFile == null) {
            return "ERROR: Download finished but the final file could not be verified. Completed data has been retained.";
        }

        if(this.settings.avoidFailingToSaveDuplicateFileName) {
            await this.environment.serializeFileOperation(async () => {
                const movedPath = await this.environment.paths.moveFile(path.dirname(verifiedFile), this.settings.downloadPath, path.basename(verifiedFile));
                verifiedFile = await this.ensureReadableNonZeroFile(movedPath);
            });
        }


        if(verifiedFile == null) {
            return "ERROR: Download finished but the final file could not be verified.";
        }
        this.video.downloadedPath = path.dirname(verifiedFile);
        this.lastVerifiedFile = verifiedFile;
        this.video.filename = path.basename(verifiedFile);

        if(this.video.audioOnly && !this.settings.downloadThumbnail) {
            await this.removeThumbnail(".jpg");
        }

        if(!this.settings.keepUnmerged) {
            await this.removeVideoDataFolder(this.getManagedDownloadRoot());
        }

        return null;
    }

    async verifyCompletedDownload(folderPath) {
        if(this.completedFilePath == null) return null;
        const relative = path.relative(path.resolve(folderPath), this.completedFilePath);
        if(!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
        return this.ensureReadableNonZeroFile(this.completedFilePath);
    }

    async ensureReadableNonZeroFile(filePath) {
        try {
            await fs.promises.access(filePath, fs.constants.R_OK);
            const stats = await fs.promises.stat(filePath);
            if(!stats.isFile() || stats.size <= 0) {
                return null;
            }
            return filePath;
        } catch (error) {
            return null;
        }
    }

    async removeVideoDataFolder(folderPath) {
        if(folderPath != null) {
            try {
                await fs.promises.rm(folderPath, {recursive : true, force : true});
            } catch(e) {
                console.log("No left-over Temp Folder found to remove. (" + folderPath + ")")
            }
        }
    }

    async delay(delayMs) {
        return await new Promise((resolve) => {
            setTimeout(resolve, delayMs);
        });
    }
}
module.exports = DownloadQuery;
