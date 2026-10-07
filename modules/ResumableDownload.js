const axios = require("axios");
const fs = require("fs");
const path = require("path");

class ResumableDownload {
    constructor() {
        this.defaultRequestTimeoutMs = 10000;
        this.defaultStallTimeoutMs = 12000;
        this.defaultMaxAttempts = 2;
    }

    async download(url, destination, options = {}) {
        const settings = {
            headers: options.headers || {},
            httpsAgent: options.httpsAgent,
            maxAttempts: options.maxAttempts || this.defaultMaxAttempts,
            onProgress: options.onProgress,
            onRetry: options.onRetry,
            requestTimeoutMs: options.requestTimeoutMs || this.defaultRequestTimeoutMs,
            stallTimeoutMs: options.stallTimeoutMs || this.defaultStallTimeoutMs
        };

        let lastError;
        for (let attempt = 1; attempt <= settings.maxAttempts; attempt++) {
            try {
                return await this.downloadAttempt(url, destination, settings);
            } catch (error) {
                lastError = error;
                if (attempt < settings.maxAttempts && settings.onRetry != null) {
                    settings.onRetry({
                        attempt: attempt + 1,
                        maxAttempts: settings.maxAttempts,
                        error: error
                    });
                }
            }
        }
        throw lastError;
    }

    async downloadAttempt(url, destination, settings) {
        const partialPath = destination + ".part";
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });

        let existingBytes = await this.getFileSize(partialPath);
        const headers = { ...settings.headers };
        if (existingBytes > 0) {
            headers.Range = `bytes=${existingBytes}-`;
        }

        const response = await axios.get(url, {
            headers: headers,
            httpsAgent: settings.httpsAgent,
            responseType: "stream",
            timeout: settings.requestTimeoutMs,
            validateStatus: (status) => status === 200 || status === 206
        });

        const shouldResume = existingBytes > 0 && response.status === 206;
        if (!shouldResume && existingBytes > 0) {
            await fs.promises.rm(partialPath, { force: true });
            existingBytes = 0;
        }

        const writer = fs.createWriteStream(partialPath, { flags: shouldResume ? "a" : "w" });
        const totalBytes = this.getTotalBytes(response.headers, existingBytes, response.status);

        return await new Promise((resolve, reject) => {
            let settled = false;
            let receivedBytes = existingBytes;
            let stallTimer;

            function cleanup() {
                if (stallTimer != null) {
                    clearTimeout(stallTimer);
                }
            }

            function rejectOnce(error) {
                if (settled) return;
                settled = true;
                cleanup();
                response.data.destroy();
                writer.destroy();
                reject(error);
            }

            function resetStallTimer() {
                cleanup();
                stallTimer = setTimeout(() => {
                    rejectOnce(new Error(`Download stalled for ${settings.stallTimeoutMs}ms.`));
                }, settings.stallTimeoutMs);
            }

            resetStallTimer();

            response.data.on("data", (chunk) => {
                receivedBytes += chunk.length;
                resetStallTimer();
                if (settings.onProgress != null) {
                    settings.onProgress({
                        transferred: receivedBytes,
                        total: totalBytes
                    });
                }
            });

            response.data.on("error", rejectOnce);

            writer.on("error", rejectOnce);

            writer.on("close", async () => {
                if (settled) return;
                settled = true;
                cleanup();
                try {
                    await ResumableDownload.promoteFile(partialPath, destination);
                    resolve(destination);
                } catch (error) {
                    reject(error);
                }
            });

            response.data.pipe(writer);
        });
    }

    async getFileSize(filePath) {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.size;
        } catch (error) {
            return 0;
        }
    }

    getTotalBytes(headers, existingBytes, statusCode) {
        const contentRange = headers["content-range"];
        if (contentRange != null) {
            const total = parseInt(contentRange.split("/").pop(), 10);
            if (!Number.isNaN(total)) {
                return total;
            }
        }

        const contentLength = parseInt(headers["content-length"], 10);
        if (Number.isNaN(contentLength)) {
            return null;
        }

        return statusCode === 206 ? existingBytes + contentLength : contentLength;
    }

    static async promoteFile(sourcePath, destinationPath) {
        const backupPath = destinationPath + ".bak";
        let backupCreated = false;

        try {
            await ResumableDownload.retryFileOperation(() => fs.promises.rm(backupPath, { force: true }));
            try {
                await ResumableDownload.renameWithRetry(destinationPath, backupPath);
                backupCreated = true;
            } catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
            }

            await ResumableDownload.moveFile(sourcePath, destinationPath);

            if (backupCreated) {
                await ResumableDownload.retryFileOperation(() => fs.promises.rm(backupPath, { force: true }));
            }
        } catch (error) {
            if (backupCreated) {
                try {
                    await ResumableDownload.retryFileOperation(() => fs.promises.rm(destinationPath, { force: true }));
                    await ResumableDownload.moveFile(backupPath, destinationPath);
                } catch (restoreError) {
                    console.error(restoreError);
                }
            }
            throw error;
        }
    }

    static async moveFile(sourcePath, destinationPath) {
        try {
            await ResumableDownload.renameWithRetry(sourcePath, destinationPath);
        } catch (error) {
            if (error.code !== "EXDEV") {
                throw error;
            }
            await ResumableDownload.retryFileOperation(() => fs.promises.copyFile(sourcePath, destinationPath));
            await ResumableDownload.retryFileOperation(() => fs.promises.rm(sourcePath, { force: true }));
        }
    }

    static async renameWithRetry(sourcePath, destinationPath) {
        return ResumableDownload.retryFileOperation(() => fs.promises.rename(sourcePath, destinationPath));
    }

    static async retryFileOperation(operation, options = {}) {
        const attempts = options.attempts || 12;
        const delayMs = options.delayMs || 350;
        let lastError;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (!ResumableDownload.isRetryableFileError(error) || attempt === attempts) {
                    throw error;
                }
                await ResumableDownload.delay(delayMs * attempt);
            }
        }

        throw lastError;
    }

    static isRetryableFileError(error) {
        if (error == null || error.code == null) {
            return false;
        }

        return ["EBUSY", "EPERM", "EACCES", "ENOTEMPTY", "EMFILE", "ENFILE", "UNKNOWN"].includes(error.code);
    }

    static delay(delayMs) {
        return new Promise((resolve) => {
            setTimeout(resolve, delayMs);
        });
    }
}

module.exports = ResumableDownload;
