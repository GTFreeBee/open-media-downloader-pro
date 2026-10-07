const fs = require("fs");
const os = require("os");
const path = require("path");
const DownloadRecoveryStore = require("../modules/persistence/DownloadRecoveryStore");

describe("DownloadRecoveryStore", () => {
    let tempDir;
    let instance;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omdp-recovery-"));
        instance = new DownloadRecoveryStore({
            app: {
                getPath: jest.fn(() => tempDir)
            }
        });
        await instance.initialize();
    });

    afterEach(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    it("persists and reloads resumable entries", async () => {
        await instance.upsert({
            id: "job-1",
            type: "single",
            status: "active",
            sourceUrls: ["https://example.com/video"],
            request: { sourceUrl: "https://example.com/video" }
        });

        const persisted = JSON.parse(await fs.promises.readFile(instance.filePath, "utf8"));

        expect(persisted["job-1"].status).toEqual("active");
        expect(persisted["job-1"].sourceUrls).toEqual(["https://example.com/video"]);
        expect(instance.getResumableEntries()).toHaveLength(1);
        expect(instance.getTrackedUrls()).toEqual(["https://example.com/video"]);
    });

    it("keeps every entry when parallel downloads update the journal", async () => {
        await Promise.all(Array.from({length: 20}, (_, index) => instance.upsert({id: `job-${index}`, status: "active"})));
        const persisted = JSON.parse(await fs.promises.readFile(instance.filePath, "utf8"));
        expect(Object.keys(persisted)).toHaveLength(20);
        const restored = new DownloadRecoveryStore(instance.environment);
        await restored.initialize();
        expect(restored.getResumableEntries()).toHaveLength(20);
    });

    it("cleans stale orphaned staging folders", async () => {
        const orphanDir = path.join(instance.stagingRoot, "orphan-job");
        await fs.promises.mkdir(orphanDir, { recursive: true });
        const staleTime = new Date(Date.now() - (1000 * 60 * 60 * 13));
        await fs.promises.utimes(orphanDir, staleTime, staleTime);

        const result = await instance.cleanupOrphanedStaging();

        expect(result.cleaned).toEqual(1);
        await expect(fs.promises.access(orphanDir)).rejects.toThrow();
    });
});
