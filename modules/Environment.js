const Bottleneck = require("bottleneck");
const Filepaths = require("./Filepaths");
const Settings = require("./persistence/Settings");
const DetectPython = require("./DetectPython");
const Logger = require("./persistence/Logger");
const YtDlpJsRuntime = require("./YtDlpJsRuntime");
const DownloadRecoveryStore = require("./persistence/DownloadRecoveryStore");
const SiteBackoff = require("./SiteBackoff");
const fs = require("fs").promises;

class Environment {
    constructor(app) {
        this.app = app;
        this.version = app.getVersion();
        this.cookiePath = null;
        this.mainAudioOnly = false;
        this.mainVideoOnly = false;
        this.mainAudioQuality = "best";
        this.mainDownloadSubs = false;
        this.doneAction = "Do nothing";
        this.logger = new Logger(this);
        this.paths = new Filepaths(app, this);
        this.ytDlpJsRuntime = null;
        this.downloadRecovery = new DownloadRecoveryStore(this);
        this.siteBackoff = new SiteBackoff();
        this.downloadLimiter = new Bottleneck({
            trackDoneStatus: true,
            maxConcurrent: 4,
            minTime: 0
        })
        this.metadataLimiter = new Bottleneck({
            trackDoneStatus: true,
            maxConcurrent: 4,
            minTime: 0
        })
        this.fileOperationLimiter = new Bottleneck({
            trackDoneStatus: true,
            maxConcurrent: 1,
            minTime: 0
        })
    }

    //Read the settings and start required services
    async initialize() {
        await this.paths.generateFilepaths();
        this.ytDlpJsRuntime = new YtDlpJsRuntime(this.paths);
        this.settings = await Settings.loadFromFile(this.paths, this);
        await this.downloadRecovery.initialize();
        this.changeMaxConcurrent(this.settings.maxConcurrent);
        if(this.settings.cookiePath != null) { //If the file does not exist anymore, null the value and save.
            fs.access(this.settings.cookiePath).catch(() => {
                this.settings.cookiePath = null;
                this.settings.save();
            })
        }
        if(process.platform === "linux") {
            const pythonDetect = new DetectPython();
            this.pythonCommand = await pythonDetect.detect();
        } else {
            this.pythonCommand = "python";
        }
        await this.paths.validateDownloadPath();
    }

    async getYtDlpRuntimeArgs() {
        if(this.ytDlpJsRuntime == null) {
            return [];
        }
        return this.ytDlpJsRuntime.getArguments();
    }

    changeMaxConcurrent(max) {
        const effectiveDownloadConcurrency = this.paths.isLikelySyncFolder(this.settings.downloadPath)
            ? Math.min(max, 2)
            : max;
        const settings = {
            trackDoneStatus: true,
            maxConcurrent: effectiveDownloadConcurrency,
            minTime: 0
        }
        this.downloadLimiter.updateSettings(settings);
        this.metadataLimiter.updateSettings({
            trackDoneStatus: true,
            maxConcurrent: Math.min(max, 2),
            minTime: 1000
        });
    }

    async serializeFileOperation(operation) {
        return await this.fileOperationLimiter.schedule(operation);
    }
}
module.exports = Environment;
