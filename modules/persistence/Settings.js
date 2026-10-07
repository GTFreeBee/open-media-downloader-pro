const os = require("os");
const { globalShortcut, clipboard } = require('electron');
const fs = require("fs").promises;

const AUDIO_QUALITIES = new Set(["best", "worst", "320k", "256k", "224k", "192k", "160k", "128k", "96k"]);
const VIDEO_QUALITIES = new Set(["best", "worst", "2160p", "1440p", "1080p", "720p", "480p", "360p"]);
const DOWNLOAD_LANES = new Set(["audio", "video"]);

function allowedOrDefault(value, allowed, fallback) {
    return allowed.has(value) ? value : fallback;
}

class Settings {
    constructor(
        paths, env, outputFormat, audioOutputFormat, downloadPath,
        proxy, rateLimit, autoFillClipboard, noPlaylist, globalShortcut, userAgent,
        validateCertificate, enableEncoding, taskList, nameFormat, nameFormatMode,
        sizeMode, splitMode, maxConcurrent, retries, fileAccessRetries, updateBinary, downloadType, cookiePath,
        statSend, sponsorblockMark, sponsorblockRemove, sponsorblockApi, downloadMetadata, downloadJsonMetadata, compatFilename,
        downloadThumbnail, keepUnmerged, avoidFailingToSaveDuplicateFileName, calculateTotalSize, theme,
        defaultDownloadType, audioDefaultQuality, videoDefaultQuality
    ) {
        this.paths = paths;
        this.env = env
        this.outputFormat = outputFormat == null ? "mp4" : outputFormat;
        this.audioOutputFormat = audioOutputFormat == null ? "mp3" : audioOutputFormat;
        this.downloadPath = downloadPath == null ? env.app.getPath("downloads") : downloadPath;
        this.proxy = proxy == null ? "" : proxy;
        this.rateLimit = rateLimit == null ? "" : rateLimit;
        this.autoFillClipboard = autoFillClipboard == null ? true : autoFillClipboard;
        this.noPlaylist = noPlaylist == null ? false : noPlaylist;
        this.globalShortcut = globalShortcut == null ? true : globalShortcut;
        this.userAgent = userAgent === "empty" ? "empty" : "default";
        this.validateCertificate = validateCertificate == null ? true : validateCertificate;
        this.enableEncoding = enableEncoding == null ? false : enableEncoding;
        this.taskList = taskList == null ? true : taskList;
        this.nameFormat = nameFormat == null ? "%(title).200s-(%(height)sp%(fps).0d).%(ext)s" : nameFormat;
        this.nameFormatMode = nameFormatMode == null ? "%(title).200s-(%(height)sp%(fps).0d).%(ext)s" : nameFormatMode;
        this.sponsorblockMark = sponsorblockMark == null ? "" : sponsorblockMark;
        this.sponsorblockRemove = sponsorblockRemove == null ? "" : sponsorblockRemove;
        this.sponsorblockApi = sponsorblockApi == null ? "https://sponsor.ajay.app" : sponsorblockApi;
        this.downloadMetadata = downloadMetadata == null ? true : downloadMetadata;
        this.downloadJsonMetadata = downloadJsonMetadata == null ? false : downloadJsonMetadata;
        this.compatFilename = compatFilename == null ? false : compatFilename;
        this.downloadThumbnail = downloadThumbnail == null ? false : downloadThumbnail;
        this.keepUnmerged = keepUnmerged == null ? false : keepUnmerged;
        this.avoidFailingToSaveDuplicateFileName = avoidFailingToSaveDuplicateFileName == null ? false : avoidFailingToSaveDuplicateFileName;
        this.calculateTotalSize = calculateTotalSize == null ? true : calculateTotalSize;
        this.sizeMode = sizeMode == null ? "click" : sizeMode;
        this.splitMode = splitMode == null? "49" : splitMode;
        this.maxConcurrent = (maxConcurrent == null || maxConcurrent <= 0) ? this.getDefaultMaxConcurrent() : maxConcurrent; //Max concurrent is standard half of the system's available cores
        this.retries = retries || 10;
        this.fileAccessRetries = fileAccessRetries || 3;
        this.updateBinary = updateBinary == null ? true : updateBinary;
        this.downloadType = downloadType == null ? "audio" : downloadType;
        this.defaultDownloadType = allowedOrDefault(defaultDownloadType, DOWNLOAD_LANES, this.downloadType === "audio" ? "audio" : "video");
        this.audioDefaultQuality = allowedOrDefault(audioDefaultQuality, AUDIO_QUALITIES, "320k");
        this.videoDefaultQuality = allowedOrDefault(videoDefaultQuality, VIDEO_QUALITIES, "720p");
        this.cookiePath = cookiePath;
        this.statSend = statSend == null ? false : statSend;
        this.theme = theme == null ? "dark" : theme;
        this.setGlobalShortcuts();
    }

    getDefaultMaxConcurrent() {
        let halfOfCpus = Math.round(os.cpus().length / 2);

        //When os.cpus() returns an empty list, default to 4
        if (halfOfCpus <= 0) {
            halfOfCpus = 4;
        }

        return Math.min(halfOfCpus, 2);
    }

    static async loadFromFile(paths, env) {
        try {
            let result = await fs.readFile(paths.settings, "utf8");
            let data = JSON.parse(result);
            return new Settings(
                paths,
                env,
                data.outputFormat,
                data.audioOutputFormat,
                data.downloadPath,
                data.proxy,
                data.rateLimit,
                data.autoFillClipboard,
                data.noPlaylist,
                data.globalShortcut,
                data.userAgent,
                data.validateCertificate,
                data.enableEncoding,
                data.taskList,
                data.nameFormat,
                data.nameFormatMode,
                data.sizeMode,
                data.splitMode,
                data.maxConcurrent,
                data.retries,
                data.fileAccessRetries,
                data.updateBinary,
                data.downloadType,
                data.cookiePath,
                data.statSend,
                data.sponsorblockMark,
                data.sponsorblockRemove,
                data.sponsorblockApi,
                data.downloadMetadata,
                data.downloadJsonMetadata,
                data.compatFilename,
                data.downloadThumbnail,
                data.keepUnmerged,
                data.avoidFailingToSaveDuplicateFileName,
                data.calculateTotalSize,
                data.theme,
                data.defaultDownloadType,
                data.audioDefaultQuality,
                data.videoDefaultQuality
            );
        } catch(err) {
            if(err.code !== "ENOENT") console.error("Could not load settings; defaults will be used.", err);
            let settings = new Settings(paths, env);
            settings.save();
            console.log("Created new settings file.")
            return settings;
        }
    }

    update(settings) {
        this.outputFormat = settings.outputFormat;
        this.audioOutputFormat = settings.audioOutputFormat;
        this.proxy = settings.proxy;
        this.rateLimit = settings.rateLimit;
        this.autoFillClipboard = settings.autoFillClipboard;
        this.noPlaylist = settings.noPlaylist;
        this.globalShortcut = settings.globalShortcut;
        this.userAgent = settings.userAgent === "empty" ? "empty" : "default";
        this.validateCertificate = settings.validateCertificate;
        this.enableEncoding = settings.enableEncoding;
        this.taskList = settings.taskList;
        this.nameFormat = settings.nameFormat;
        this.nameFormatMode = settings.nameFormatMode;
        this.sponsorblockMark = settings.sponsorblockMark;
        this.sponsorblockRemove = settings.sponsorblockRemove;
        this.sponsorblockApi = settings.sponsorblockApi;
        this.downloadMetadata = settings.downloadMetadata;
        this.downloadJsonMetadata = settings.downloadJsonMetadata;
        this.compatFilename = settings.compatFilename;
        this.downloadThumbnail = settings.downloadThumbnail;
        this.keepUnmerged = settings.keepUnmerged;
        this.avoidFailingToSaveDuplicateFileName = settings.avoidFailingToSaveDuplicateFileName;
        this.calculateTotalSize = settings.calculateTotalSize;
        this.sizeMode = settings.sizeMode;
        this.splitMode = settings.splitMode;
        if(this.maxConcurrent !== settings.maxConcurrent) {
            this.maxConcurrent = settings.maxConcurrent;
            this.env.changeMaxConcurrent(settings.maxConcurrent);
        }
        this.retries = settings.retries;
        this.fileAccessRetries = settings.fileAccessRetries;
        this.updateBinary = settings.updateBinary;
        this.downloadType = settings.downloadType;
        this.defaultDownloadType = allowedOrDefault(settings.defaultDownloadType, DOWNLOAD_LANES, this.defaultDownloadType);
        this.audioDefaultQuality = allowedOrDefault(settings.audioDefaultQuality, AUDIO_QUALITIES, this.audioDefaultQuality);
        this.videoDefaultQuality = allowedOrDefault(settings.videoDefaultQuality, VIDEO_QUALITIES, this.videoDefaultQuality);
        this.theme = settings.theme;
        this.save();
        this.setGlobalShortcuts();
    }

    serialize() {
        return {
            outputFormat: this.outputFormat,
            audioOutputFormat: this.audioOutputFormat,
            downloadPath: this.downloadPath,
            proxy: this.proxy,
            rateLimit: this.rateLimit,
            autoFillClipboard: this.autoFillClipboard,
            noPlaylist: this.noPlaylist,
            globalShortcut: this.globalShortcut,
            userAgent: this.userAgent,
            validateCertificate: this.validateCertificate,
            enableEncoding: this.enableEncoding,
            taskList: this.taskList,
            nameFormat: this.nameFormat,
            nameFormatMode: this.nameFormatMode,
            sizeMode: this.sizeMode,
            splitMode: this.splitMode,
            maxConcurrent: this.maxConcurrent,
            retries: this.retries,
            fileAccessRetries: this.fileAccessRetries,
            defaultConcurrent: this.getDefaultMaxConcurrent(),
            updateBinary: this.updateBinary,
            downloadType: this.downloadType,
            defaultDownloadType: this.defaultDownloadType,
            audioDefaultQuality: this.audioDefaultQuality,
            videoDefaultQuality: this.videoDefaultQuality,
            cookiePath: this.cookiePath,
            statSend: this.statSend,
            sponsorblockMark: this.sponsorblockMark,
            sponsorblockRemove: this.sponsorblockRemove,
            sponsorblockApi: this.sponsorblockApi,
            downloadMetadata: this.downloadMetadata,
            downloadJsonMetadata: this.downloadJsonMetadata,
            compatFilename: this.compatFilename,
            downloadThumbnail: this.downloadThumbnail,
            keepUnmerged: this.keepUnmerged,
            avoidFailingToSaveDuplicateFileName: this.avoidFailingToSaveDuplicateFileName,
            calculateTotalSize: this.calculateTotalSize,
            theme: this.theme,
            version: this.env.version
        }
    }

    save() {
        fs.writeFile(this.paths.settings, JSON.stringify(this.serialize()), "utf8").then(() => {
            console.log("Saved settings file.")
        });
    }

    setGlobalShortcuts() {
        if(globalShortcut == null) return;
        if(!this.globalShortcut) {
            globalShortcut.unregisterAll();
        } else {
            if(!globalShortcut.isRegistered("Shift+CommandOrControl+V")) {
                globalShortcut.register('Shift+CommandOrControl+V', async () => {
                    this.env.win.webContents.send("addShortcut", clipboard.readText());
                });
            }
            if(!globalShortcut.isRegistered("Shift+CommandOrControl+D")) {
                globalShortcut.register('Shift+CommandOrControl+D', async () => {
                    this.env.win.webContents.send("downloadShortcut");
                });
            }
        }
    }
}

module.exports = Settings;
