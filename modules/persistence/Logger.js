const {dialog} = require("electron");
const path = require("path");
const fs = require("fs");

class Logger {
    constructor(environment) {
        this.environment = environment;
        this.logs = {};
    }

    log(identifier, line) {
        if(line == null || line === "") return;
        let trimmedLine;
        if(line === "done") {
            trimmedLine = "Download finished";
        } else if(line === "killed") {
            trimmedLine = "Download stopped";
        } else {
            trimmedLine = line.replace(/[\n\r]/g, "");
        }
        if(identifier in this.logs) {
            this.logs[identifier].push(trimmedLine);
        } else {
            this.logs[identifier] = [trimmedLine];
        }
    }

    get(identifier) {
        return this.logs[identifier];
    }

    getDiagnosticsDir() {
        return path.join(this.environment.app.getPath("userData"), "logs");
    }

    clear(identifier) {
        delete this.logs[identifier];
    }

    async save(identifier) {
        const logLines = this.logs[identifier];
        let log = "";
        for(const line of logLines) {
            log += line + "\n";
        }
        const date = new Date().toLocaleString()
            .replace(", ", "-")
            .replace(/\//g, "-")
            .replace(/:/g, "-")
        let result = await dialog.showSaveDialog(this.environment.win, {
            defaultPath: path.join(this.environment.settings.downloadPath, "ytdl-log-" + date.slice(0, date.length - 6)),
            buttonLabel: "Save metadata",
            filters: [
                { name: "txt", extensions: ["txt"] },
                { name: "All Files", extensions: ["*"] },
            ],
            properties: ["createDirectory"]
        });
        if(!result.canceled) {
            fs.promises.writeFile(result.filePath, log).then(() => console.log("Download log saved."));
        }
    }

    async persistFailure(identifier, metadata = {}) {
        const logLines = this.logs[identifier] || [];
        if(logLines.length === 0 && metadata.description == null) {
            return null;
        }

        const logDir = this.getDiagnosticsDir();
        await fs.promises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, "-");
        const safeCodeSource = metadata.code || "download-error";
        const safeCode = safeCodeSource
            .replace(/[^a-z0-9-_]+/gi, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "download-error";
        const filePath = path.join(logDir, `${timestamp}-${safeCode}-${identifier.slice(0, 8)}.log`);

        let log = `Identifier: ${identifier}\n`;
        if(metadata.code != null) log += `Code: ${metadata.code}\n`;
        if(metadata.url != null) log += `URL: ${metadata.url}\n`;
        if(metadata.description != null) log += `Description: ${metadata.description}\n`;
        log += "\n";
        for(const line of logLines) {
            log += line + "\n";
        }

        await fs.promises.writeFile(filePath, log, "utf8");
        console.log("Failure log saved: " + filePath);
        return filePath;
    }

    async getCombined(identifier) {
        if(this.logs[identifier] != null) {
            return this.logs[identifier];
        }
        const persistedFailure = await this.getLatestPersistedFailure(identifier);
        if(persistedFailure == null) {
            return null;
        }
        return persistedFailure.lines;
    }

    async getLatestPersistedFailure(identifier) {
        const logDir = this.getDiagnosticsDir();
        let files;
        try {
            files = await fs.promises.readdir(logDir);
        } catch (error) {
            return null;
        }
        const matching = files
            .filter((file) => file.endsWith(".log"))
            .sort()
            .reverse();
        for(const file of matching) {
            const filePath = path.join(logDir, file);
            const content = await fs.promises.readFile(filePath, "utf8");
            if(!content.includes(`Identifier: ${identifier}`)) {
                continue;
            }
            return {
                path: filePath,
                lines: content.split(/\r?\n/).filter((line) => line.length > 0)
            };
        }
        return null;
    }

    async buildFailureReport(identifier) {
        const persistedFailure = await this.getLatestPersistedFailure(identifier);
        const lines = await this.getCombined(identifier) || [];
        let report = "Open Media Downloader Pro failure report\n";
        report += `Generated: ${new Date().toISOString()}\n`;
        report += `Identifier: ${identifier}\n`;
        if(persistedFailure != null) {
            report += `Persisted log: ${persistedFailure.path}\n`;
        }
        report += "\n";
        for(const line of lines.slice(-80)) {
            report += line + "\n";
        }
        return report;
    }

}

module.exports = Logger;
