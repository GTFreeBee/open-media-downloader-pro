const fs = require("fs");
const path = require("path");

class DownloadRecoveryStore {
    constructor(environment) {
        this.environment = environment;
        this.filePath = path.join(environment.app.getPath("userData"), "download-recovery.json");
        this.stagingRoot = path.join(environment.app.getPath("userData"), "download-staging");
        this.entries = {};
        this.saveQueue = Promise.resolve();
    }

    async initialize() {
        await fs.promises.mkdir(this.stagingRoot, { recursive: true });
        try {
            const raw = await fs.promises.readFile(this.filePath, "utf8");
            this.entries = JSON.parse(raw);
        } catch (error) {
            this.entries = {};
        }
    }

    async upsert(entry) {
        this.entries[entry.id] = {
            ...(this.entries[entry.id] || {}),
            ...entry,
            updatedAt: new Date().toISOString()
        };
        await this.save();
    }

    async markProgress(id, progress) {
        if (this.entries[id] == null) {
            return;
        }
        this.entries[id] = {
            ...this.entries[id],
            progress,
            updatedAt: new Date().toISOString()
        };
        await this.save();
    }

    async markInterrupted(id, details = {}) {
        if (this.entries[id] == null) {
            return;
        }
        this.entries[id] = {
            ...this.entries[id],
            status: "interrupted",
            lastError: details.lastError,
            progress: details.progress || this.entries[id].progress,
            updatedAt: new Date().toISOString()
        };
        await this.save();
    }

    async markResumed(id) {
        if (this.entries[id] == null) {
            return;
        }
        this.entries[id] = {
            ...this.entries[id],
            status: "active",
            resumedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await this.save();
    }

    async addStagingKey(id, stagingKey) {
        if (this.entries[id] == null || stagingKey == null) {
            return;
        }
        const stagingKeys = new Set(this.entries[id].stagingKeys || []);
        stagingKeys.add(stagingKey);
        this.entries[id] = {
            ...this.entries[id],
            stagingKeys: [...stagingKeys],
            updatedAt: new Date().toISOString()
        };
        await this.save();
    }

    getEntry(id) {
        if (this.entries[id] == null) {
            return null;
        }
        return {
            ...this.entries[id]
        };
    }

    async complete(id) {
        if (this.entries[id] == null) {
            return;
        }
        delete this.entries[id];
        await this.save();
    }

    async removeStagingKeys(stagingKeys = []) {
        for(const stagingKey of [...new Set(stagingKeys.filter((key) => key != null))]) {
            const targetPath = path.join(this.stagingRoot, stagingKey);
            await fs.promises.rm(targetPath, { recursive: true, force: true });
        }
    }

    async cancel(id, options = {}) {
        const entry = this.entries[id];
        if (entry == null) {
            if(options.stagingKeys != null) {
                await this.removeStagingKeys(options.stagingKeys);
            }
            return;
        }
        await this.removeStagingKeys([
            ...(entry.stagingKeys || []),
            ...(options.stagingKeys || [])
        ]);
        delete this.entries[id];
        await this.save();
    }

    getResumableEntries() {
        return Object.values(this.entries).filter((entry) => entry.status === "active" || entry.status === "interrupted");
    }

    getTrackedUrls() {
        const urls = [];
        for (const entry of this.getResumableEntries()) {
            if (entry.sourceUrls != null) {
                urls.push(...entry.sourceUrls);
            }
        }
        return [...new Set(urls)];
    }

    async cleanupOrphanedStaging() {
        const activeKeys = new Set(this.getResumableEntries()
            .flatMap((entry) => entry.stagingKeys || []));
        let cleaned = 0;
        let directories = [];
        try {
            directories = await fs.promises.readdir(this.stagingRoot, { withFileTypes: true });
        } catch (error) {
            return { cleaned: 0 };
        }
        for (const dirent of directories) {
            if (!dirent.isDirectory()) {
                continue;
            }
            if (activeKeys.has(dirent.name)) {
                continue;
            }
            const targetPath = path.join(this.stagingRoot, dirent.name);
            const stats = await fs.promises.stat(targetPath);
            const ageMs = Date.now() - stats.mtimeMs;
            if (ageMs < 1000 * 60 * 60 * 12) {
                continue;
            }
            await fs.promises.rm(targetPath, { recursive: true, force: true });
            cleaned++;
        }
        return { cleaned };
    }

    async save() {
        const snapshot = JSON.stringify(this.entries, null, 2);
        const write = this.saveQueue.catch(() => null).then(async () => {
            await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
            const tempPath = this.filePath + ".tmp";
            await fs.promises.writeFile(tempPath, snapshot, "utf8");
            await fs.promises.rename(tempPath, this.filePath);
        });
        this.saveQueue = write;
        return write;
    }
}

module.exports = DownloadRecoveryStore;
