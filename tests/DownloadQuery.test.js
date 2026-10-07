const DownloadQuery = require("../modules/download/DownloadQuery");
const fs = require("fs");
const os = require("os");
const path = require("path");

afterEach(() => {
    jest.restoreAllMocks();
});

describe("DownloadQuery resilience", () => {
    it("prefers an audio stream for MP3 conversion", () => {
        const {instance} = buildInstance({avoidDuplicates: false});
        instance.video.audioOnly = true;
        instance.settings.audioOutputFormat = "mp3";
        const args = instance.buildArguments("C:\\downloads");
        expect(args[args.indexOf("-f") + 1]).toBe("bestaudio/best");
    });
    it("adds resumable and retry-friendly yt-dlp flags to downloads", () => {
        const { instance } = buildInstance({ avoidDuplicates: false });

        const args = instance.buildArguments("C:\\downloads");
        expect(args).toContain("--continue");
        expect(args).toContain("--part");
        expect(args).toContain("--socket-timeout");
        expect(args).toContain("30");
        expect(args).toContain("--retries");
        expect(args).toContain("10");
        expect(args).toContain("--fragment-retries");
        expect(args).toContain("--file-access-retries");
        expect(args).toContain("3");
        expect(args).toContain("--retry-sleep");
        expect(args).toContain("linear=1:10:2");
        expect(args).toContain("fragment:exp=1:20");
        expect(args).toContain("file_access:linear=1:5:1");
        expect(args).toContain("extractor:linear=1:10:2");
    });

    it("stores yt-dlp temp files in app-managed storage", () => {
        const { instance } = buildInstance({ avoidDuplicates: false });

        const downloadFolder = path.join(os.tmpdir(), "omdp-downloads");
        const args = instance.buildArguments(downloadFolder);
        expect(args).toContain("--paths");
        const tempPath = args[args.indexOf("--paths") + 1];
        expect(tempPath).toBe(`temp:${instance.getTemporaryDownloadFolder()}`);
        expect(path.isAbsolute(args[args.indexOf("-o") + 1])).toBe(false);
        expect(args).toContain(`home:${path.resolve(downloadFolder)}`);
        expect(args).toContain("after_move:__OMDP_FILE__%(filepath)j");
    });

    it("uses a stable temp folder when duplicate-safe downloads are enabled", () => {
        const { instance } = buildInstance({ avoidDuplicates: true });

        const firstArgs = instance.buildArguments(instance.getResilientDownloadFolder());
        const secondArgs = instance.buildArguments(instance.getResilientDownloadFolder());
        const firstOutput = firstArgs[firstArgs.indexOf("-o") + 1];
        const secondOutput = secondArgs[secondArgs.indexOf("-o") + 1];

        expect(firstArgs).toContain(`home:${path.resolve(instance.getResilientDownloadFolder())}`);
        expect(path.isAbsolute(firstOutput)).toBe(false);
        expect(firstOutput).toEqual(secondOutput);
    });

    it("uses a safe literal basename override while keeping the final extension dynamic", () => {
        const { instance } = buildInstance({ avoidDuplicates: false });
        instance.video.filenameOverride = "My 100% Mix";

        const args = instance.buildArguments("C:\\downloads");

        expect(args[args.indexOf("-o") + 1]).toBe("My 100%% Mix.%(ext)s");
    });

    it("cleans resumable artefacts when a download is cancelled", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omdp-download-cancel-"));
        const downloadPath = path.join(tempDir, "downloads");
        await fs.promises.mkdir(downloadPath, { recursive: true });
        const { instance } = buildInstance({ avoidDuplicates: false, appDataPath: tempDir, downloadPath });
        const stagingRoot = instance.getManagedDownloadRoot();

        await fs.promises.mkdir(stagingRoot, { recursive: true });
        await fs.promises.writeFile(path.join(downloadPath, "Example File.mp4.part"), "partial");
        await fs.promises.writeFile(path.join(downloadPath, "Unrelated.mp4.part"), "partial");

        await instance.cancel();

        await expect(fs.promises.access(stagingRoot)).rejects.toThrow();
        await expect(fs.promises.access(path.join(downloadPath, "Example File.mp4.part"))).rejects.toThrow();
        await expect(fs.promises.access(path.join(downloadPath, "Unrelated.mp4.part"))).resolves.toBeUndefined();

        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });
});

describe("completed file verification", () => {
    let tempDir;
    beforeEach(() => { tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omdp-verify-")); });
    afterEach(async () => { await fs.promises.rm(tempDir, {recursive: true, force: true}); });

    it("tracks Unicode filenames from the structured final record", async () => {
        const {instance} = buildInstance({avoidDuplicates: false, appDataPath: tempDir, downloadPath: tempDir});
        const file = path.join(tempDir, 'Food ｜ Musical 😀.mp3');
        await fs.promises.writeFile(file, "media");
        instance.start = jest.fn(async (url, args, callback) => {
            callback('[ExtractAudio] Destination: wrong filename.mp3');
            callback('__OMDP_FILE__' + JSON.stringify(file));
            return "done";
        });
        expect(await instance.connect()).toBe("done");
        expect(instance.lastVerifiedFile).toBe(file);
        expect(instance.video.filename).toBe(path.basename(file));
    });

    it("rejects unrelated files, missing files, empty files and directories", async () => {
        const {instance} = buildInstance({avoidDuplicates: false, appDataPath: tempDir, downloadPath: tempDir});
        await fs.promises.writeFile(path.join(tempDir, "Example File-other.mp4"), "unrelated");
        expect(await instance.verifyCompletedDownload(tempDir)).toBeNull();
        instance.completedFilePath = path.join(tempDir, "missing.mp4");
        expect(await instance.verifyCompletedDownload(tempDir)).toBeNull();
        await fs.promises.writeFile(instance.completedFilePath, "");
        expect(await instance.verifyCompletedDownload(tempDir)).toBeNull();
        instance.completedFilePath = path.join(tempDir, "directory.mp4");
        await fs.promises.mkdir(instance.completedFilePath);
        expect(await instance.verifyCompletedDownload(tempDir)).toBeNull();
    });

    it("preserves staged media if final promotion fails", async () => {
        const {instance} = buildInstance({avoidDuplicates: true, appDataPath: tempDir, downloadPath: tempDir});
        const output = instance.getResilientDownloadFolder();
        await fs.promises.mkdir(output, {recursive: true});
        instance.completedFilePath = path.join(output, "track.mp3");
        await fs.promises.writeFile(instance.completedFilePath, "media");
        instance.environment.paths.moveFile.mockRejectedValue(new Error("Access denied"));
        await expect(instance.finalizeSuccessfulDownload(output)).rejects.toThrow("Access denied");
        expect(await fs.promises.readFile(instance.completedFilePath, "utf8")).toBe("media");
    });

    it("uses the actual indexed destination when avoiding duplicate filenames", async () => {
        const {instance} = buildInstance({avoidDuplicates: true, appDataPath: tempDir, downloadPath: tempDir});
        const output = instance.getResilientDownloadFolder();
        await fs.promises.mkdir(output, {recursive: true});
        instance.completedFilePath = path.join(output, "track.mp3");
        await fs.promises.writeFile(instance.completedFilePath, "new media");
        await fs.promises.writeFile(path.join(tempDir, "track.mp3"), "old media");
        const indexed = path.join(tempDir, "track(1).mp3");
        instance.environment.paths.moveFile.mockImplementation(async () => {
            await fs.promises.rename(instance.completedFilePath, indexed);
            return indexed;
        });
        expect(await instance.finalizeSuccessfulDownload(output)).toBeNull();
        expect(instance.lastVerifiedFile).toBe(indexed);
        expect(await fs.promises.readFile(path.join(tempDir, "track.mp3"), "utf8")).toBe("old media");
    });

    it("keeps the output folder fixed if settings change during a download", () => {
        const {instance} = buildInstance({avoidDuplicates: false, appDataPath: tempDir, downloadPath: tempDir});
        instance.environment.settings.downloadPath = "C:\\somewhere-else";
        expect(instance.settings.downloadPath).toBe(tempDir);
    });
});

function buildInstance({
    avoidDuplicates,
    appDataPath = path.join(os.tmpdir(), "omdp-app-data"),
    downloadPath = path.join(os.tmpdir(), "omdp-downloads")
}) {
    const progressBar = {
        setInitial: jest.fn(),
        reset: jest.fn(),
        updateDownload: jest.fn()
    };
    const video = {
        identifier: "video-id",
        formats: [{ height: "1080", fps: "60" }],
        selected_format_index: 0,
        audioOnly: false,
        videoOnly: false,
        audioQuality: "best",
        downloadSubs: false,
        subLanguages: [],
        selectedEncoding: "none",
        selectedAudioEncoding: "none",
        downloadingAudio: false,
        setFilename: jest.fn(),
        getFilename: jest.fn(() => "Example File.mp4"),
        downloadedPath: downloadPath
    };
    const environment = {
        settings: {
            downloadPath: downloadPath,
            avoidFailingToSaveDuplicateFileName: avoidDuplicates,
            nameFormat: "%(title).200s-(%(height)sp%(fps).0d).%(ext)s",
            nameFormatMode: "%(title).200s-(%(height)sp%(fps).0d).%(ext)s",
            audioOutputFormat: "none",
            outputFormat: "none",
            downloadMetadata: false,
            compatFilename: false,
            downloadThumbnail: false,
            sponsorblockMark: "",
            sponsorblockRemove: "",
            keepUnmerged: false,
            retries: "10",
            fileAccessRetries: "3"
        },
        paths: {
            ffmpeg: "C:\\ffmpeg",
            moveFile: jest.fn()
        },
        app: {
            getPath: jest.fn(() => appDataPath)
        },
        logger: {
            log: jest.fn()
        },
        errorHandler: {
            checkError: jest.fn()
        },
        downloadLimiter: {
            schedule: async (fn) => await fn()
        },
        serializeFileOperation: async (fn) => await fn(),
        siteBackoff: {
            wait: jest.fn().mockResolvedValue(0),
            register: jest.fn(),
            clear: jest.fn()
        }
    };
    const instance = new DownloadQuery("https://example.com/video", video, environment, progressBar, {});
    return { instance };
}
