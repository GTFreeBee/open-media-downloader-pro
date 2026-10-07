const InfoQuery = require("./info/InfoQuery");
const Video = require("./types/Video");
const Utils = require("./Utils");
const InfoQueryList = require("./info/InfoQueryList");
const ProgressBar = require("./types/ProgressBar");
const DownloadQuery = require("./download/DownloadQuery");
const { shell, dialog } = require('electron');
const axios = require('axios')
const path = require('path')
const url = require('url');
const fs = require("fs");
const SizeQuery = require("./size/SizeQuery");
const DownloadQueryList = require("./download/DownloadQueryList");
const Format = require("./types/Format");
const DoneAction = require("./DoneAction");
const FilenameOverride = require("./FilenameOverride");

class QueryManager {
    constructor(window, environment) {
        this.window = window;
        this.environment = environment;
        this.managedVideos = [];
        this.playlistMetadata = [];
        this.activeDownloadActions = new Map();
        this.pendingRecoveryActions = [];
    }

    async manage(url) {
        let metadataVideo = new Video(url, "metadata", this.environment);
        this.addVideo(metadataVideo);
        let metadataQuery = new InfoQuery(url, metadataVideo.identifier, this.environment);
        metadataVideo.setQuery(metadataQuery);
        const initialQuery = await metadataQuery.connect();
        if(!this.isManagedVideo(metadataVideo.identifier) || metadataVideo.error || initialQuery == null || initialQuery === "killed") return;
        if(Utils.isYouTubeChannel(url)) {
            metadataQuery = new InfoQuery(initialQuery.entries[0].url, metadataVideo.identifier, this.environment);
            metadataVideo.setQuery(metadataQuery);
            const actualQuery = await metadataQuery.connect();
            if(!this.isManagedVideo(metadataVideo.identifier) || metadataVideo.error || actualQuery == null || actualQuery === "killed") return;
            this.removeVideo(metadataVideo);
            if(actualQuery.entries == null || actualQuery.entries.length === 0) this.managePlaylist(initialQuery, url);
            else this.managePlaylist(actualQuery, initialQuery.entries[0].url);
            return;
        }

        switch(Utils.detectInfoType(initialQuery)) {
            case "single":
                this.manageSingle(initialQuery, url);
                this.removeVideo(metadataVideo);
                break;
            case "playlist":
                this.managePlaylist(initialQuery, url);
                this.removeVideo(metadataVideo);
                break;
            case "livestream":
                this.environment.errorHandler.raiseError({code: "Not supported", description: "Livestreams are not yet supported."}, metadataVideo.identifier);
                break;
            default:
                //This.environment.errorHandler.raiseUnhandledError("The downloader backend returned an empty object\n" + JSON.stringify(Utils.detectInfoType(initialQuery), null, 2), metadataVideo.identifier);
                break;
        }
    }

    manageSingle(initialQuery, url) {
        let video = new Video(url, "single", this.environment);
        video.setMetadata(initialQuery);
        this.addVideo(video);
        this.tryStartPendingRecoveryActions();
        setTimeout(() => this.updateGlobalButtons(), 700); //This feels kinda hacky, maybe find a better way sometime.
    }

    managePlaylist(initialQuery, url) {
        this.playlistMetadata = this.playlistMetadata.concat(Utils.generatePlaylistMetadata(initialQuery));
        let playlistVideo = new Video(url, "playlist", this.environment);
        this.addVideo(playlistVideo);
        const playlistQuery = new InfoQueryList(initialQuery, this.environment, new ProgressBar(this, playlistVideo));
        playlistVideo.setQuery(playlistQuery);
        playlistQuery.start().then((videos) => {
            if(!this.isManagedVideo(playlistVideo.identifier) || playlistVideo.error || videos == null) {
                return;
            }
            if(videos.length > this.environment.settings.splitMode) {
                let totalFormats = [];
                let totalAudioCodecs = [];
                playlistVideo.videos = videos;
                for(const video of videos) {
                    for(const audioCodec of video.audioCodecs) {
                        if(!totalAudioCodecs.includes(audioCodec)) {
                            totalAudioCodecs.push(audioCodec);
                        }
                    }
                    for(const format of video.formats) {
                        format.display_name = Format.getDisplayName(format.height, format.fps);
                        totalFormats.push(format);
                    }
                }
                //Dedupe totalFormats by height and fps
                totalFormats = totalFormats.filter((v,i,a) => a.findIndex(t=>(t.height === v.height && t.fps === v.fps))===i);
                //Sort totalFormats DESC by height and fps
                totalFormats.sort((a, b) => b.height - a.height || b.fps - a.fps);
                const title = initialQuery.title == null ? url : initialQuery.title;
                const uploader = initialQuery.uploader == null ? "Unknown" : initialQuery.uploader;
                if(this.window != null) {
                    this.window.webContents.send("videoAction", {
                        action: "setUnified",
                        identifier: playlistVideo.identifier,
                        formats: totalFormats,
                        subtitles: this.environment.mainDownloadSubs,
                        thumb: videos[0].thumbnail,
                        audioCodecs: totalAudioCodecs,
                        title: title,
                        length: videos.length,
                        uploader: uploader,
                        url: playlistVideo.url
                    })
                }
            } else {
                this.removeVideo(playlistVideo);
                for (const video of videos) {
                    this.addVideo(video);
                }
            }
            this.tryStartPendingRecoveryActions();
            setTimeout(() => this.updateGlobalButtons(), 700); //This feels kinda hacky, maybe find a better way sometime.
            setTimeout(() => this.updateGlobalButtons(), 2000); //This feels even more hacky, maybe find a better way sometime.
        });
    }

    addVideo(video) {
        this.managedVideos.push(video);
        let formats = [];
        if(video.hasMetadata) {
            for(const format of video.formats) {
                formats.push(format.serialize());
            }
        }
        let args = {
            action: "add",
            type: video.type,
            identifier:  video.identifier,
            url: video.url,
            title: video.title,
            filenameBase: FilenameOverride.normalize(video.getFilename() || video.title),
            duration: video.duration,
            audioOnly: video.audioOnly,
            subtitles: video.downloadSubs,
            loadSize: this.environment.settings.sizeMode === "full",
            hasFilesizes: video.hasFilesizes,
            audioCodecs: video.audioCodecs,
            formats: formats,
            selected_format_index: (video.hasMetadata) ? video.selected_format_index : null,
            thumbnail: video.thumbnail
        }
        this.window.webContents.send("videoAction", args);
    }

    downloadVideo(args) {
        let downloadVideo = this.getVideo(args.identifier);
        downloadVideo.filenameOverride = FilenameOverride.normalize(args.filenameOverride);
        downloadVideo.selectedEncoding = args.encoding;
        downloadVideo.selectedAudioEncoding = args.audioEncoding;
        downloadVideo.audioOnly = args.type === "audio";
        downloadVideo.videoOnly = args.type === "videoOnly";
        if(!downloadVideo.audioOnly) {
            for (const format of downloadVideo.formats) {
                if (format.getDisplayName() === args.format) {
                    downloadVideo.selected_format_index = downloadVideo.formats.indexOf(format);
                    break;
                }
            }
        }
        downloadVideo.audioQuality = (downloadVideo.audioQuality != null) ? downloadVideo.audioQuality : "best";
        if(args.subtitleState != null) {
            this.applySubtitleState(downloadVideo, args.subtitleState);
        }
        let progressBar = new ProgressBar(this, downloadVideo);
        const actionId = this.registerDownloadAction(
            args.recoveryActionId,
            args.snapshot || this.buildSingleActionSnapshot(downloadVideo, args),
            [downloadVideo],
            1,
            args.resumeRecovery === true
        );
        downloadVideo.setQuery(new DownloadQuery(downloadVideo.url, downloadVideo, this.environment, progressBar, this.playlistMetadata));
        downloadVideo.query.connect().then((returnValue) => {
            this.recordDownloadActionResult(actionId, returnValue, downloadVideo);
            //Backup done call, sometimes it does not trigger automatically from within the downloadQuery.
            if(returnValue !== "done") {
                if(returnValue !== "killed") {
                    downloadVideo.error = true;
                    this.environment.errorHandler.checkError(returnValue, downloadVideo.identifier);
                }
                this.updateGlobalButtons();
                return;
            }
            if(downloadVideo.error) return;
            if(this.environment.settings.downloadJsonMetadata) this.saveInfo(downloadVideo.identifier, false);
            downloadVideo.downloaded = true;
            downloadVideo.query.progressBar.done(downloadVideo.audioOnly);
            this.updateGlobalButtons();
        });
    }

    downloadAllVideos(args) {
        let videosToDownload = [];
        let unifiedPlaylists = [];
        let videoMetadata = [];
        const queueItems = [];
        for(const videoObj of args.videos) {
            let video = this.getVideo(videoObj.identifier);
            if(video == null) continue;
            video.filenameOverride = video.videos == null ? FilenameOverride.normalize(videoObj.filenameOverride) : null;
            video.selectedEncoding = videoObj.encoding;
            video.selectedAudioEncoding = videoObj.audioEncoding;
            if(videoObj.subtitleState != null) {
                this.applySubtitleState(video, videoObj.subtitleState, video.videos != null);
            }
            if(video.videos == null) {
                if(video.downloaded || video.type !== "single") continue;
                video.audioOnly = videoObj.type === "audio";
                video.videoOnly = videoObj.type === "videoOnly";
                if(video.audioOnly) {
                    video.audioQuality = videoObj.format;
                } else {
                    for (const format of video.formats) {
                        if (format.getDisplayName() === videoObj.format) {
                            video.selected_format_index = video.formats.indexOf(format);
                            break;
                        }
                    }
                }
                const videoMeta = Utils.getVideoInPlaylistMetadata(video.url, null, this.playlistMetadata);
                if(videoMeta != null) {
                    videoMetadata.push(videoMeta);
                }
                video.audioQuality = (video.audioQuality != null) ? video.audioQuality : "best";
                videosToDownload.push(video);
                queueItems.push(this.buildQueueItemSnapshot(video, videoObj, false));
            } else {
                video.url = videoObj.url;
                unifiedPlaylists.push(video);
                this.getUnifiedVideos(video, video.videos, videoObj.type === "audio", videoObj.format, videoObj.downloadSubs);
                for(const unifiedVideo of video.videos) {
                    const videoMeta = Utils.getVideoInPlaylistMetadata(unifiedVideo.url, video.url, this.playlistMetadata);
                    if(videoMeta != null) {
                        videoMetadata.push(videoMeta);
                    }
                    unifiedVideo.parentID = video.identifier;
                    unifiedVideo.parentSize = video.videos.length;
                    videosToDownload.push(unifiedVideo);
                }
                queueItems.push(this.buildQueueItemSnapshot(video, videoObj, true));
            }
        }
        const actionId = this.registerDownloadAction(
            args.recoveryActionId,
            args.snapshot || {
                type: "queue",
                sourceUrls: queueItems.map((item) => item.sourceUrl),
                request: {
                    videos: queueItems
                }
            },
            videosToDownload,
            videosToDownload.length,
            args.resumeRecovery === true
        );
        for(const unifiedPlaylist of unifiedPlaylists) {
            unifiedPlaylist.activeRecoveryActionId = actionId;
        }
        let progressBar = new ProgressBar(this, "queue");
        let downloadList = new DownloadQueryList(videosToDownload, videoMetadata, this.environment, this, progressBar, {
            onItemResult: (video, returnValue) => {
                this.recordDownloadActionResult(actionId, returnValue, video);
            }
        });
        for(const unifiedPlaylist of unifiedPlaylists) { unifiedPlaylist.setQuery(downloadList) }
        downloadList.start().then(() => {
            for(const unifiedPlaylist of unifiedPlaylists) { unifiedPlaylist.downloaded = true }
            this.updateGlobalButtons();
            const doneAction = new DoneAction();
            doneAction.executeAction(this.environment.doneAction);
        })
    }

    getUnifiedVideos(playlist, videos, audioOnly, selectedFormat, subtitles) {
        playlist.audioOnly = audioOnly
        if(!playlist.audioOnly) {
            for (const video of videos) {
                video.downloadSubs = subtitles;
                let gotFormatMatch = false;
                for (const format of video.formats) {
                    if (format.getDisplayName() === selectedFormat) {
                        video.selected_format_index = video.formats.indexOf(format);
                        gotFormatMatch = true;
                        break;
                    }
                }
                if (!gotFormatMatch) {
                    const suppliedFormat = Format.getFromDisplayName(selectedFormat);
                    const output = video.formats.reduce((prev, curr) => Math.abs(curr.height - suppliedFormat.height) < Math.abs(prev.height - suppliedFormat.height) ? curr : prev);
                    video.selected_format_index = video.formats.indexOf(output);
                }
            }
        } else {
            for(const video of videos) {
                video.downloadSubs = subtitles;
                video.audioOnly = true;
                video.audioQuality = (playlist.audioQuality != null) ? playlist.audioQuality : "best";
            }
        }
        playlist.audioQuality = (playlist.audioQuality != null) ? playlist.audioQuality : "best";
    }

    downloadUnifiedPlaylist(args) {
        const playlist = this.getVideo(args.identifier);
        const videos = playlist.videos;
        const metadata = videos.map(vid => Utils.getVideoInPlaylistMetadata(vid.url, playlist.url, this.playlistMetadata)).filter(entry => entry != null);
        if(args.subtitleState != null) {
            this.applySubtitleState(playlist, args.subtitleState, true);
        }
        this.getUnifiedVideos(playlist, videos, args.type === "audio", args.format, playlist.downloadSubs);
        playlist.audioQuality = (playlist.audioQuality != null) ? playlist.audioQuality : "best";
        const actionId = this.registerDownloadAction(
            args.recoveryActionId,
            args.snapshot || this.buildUnifiedActionSnapshot(playlist, args),
            videos,
            videos.length,
            args.resumeRecovery === true
        );
        playlist.activeRecoveryActionId = actionId;
        let progressBar = new ProgressBar(this, playlist);
        playlist.setQuery(new DownloadQueryList(videos, metadata, this.environment, this, progressBar, {
            onItemResult: (video, returnValue) => {
                this.recordDownloadActionResult(actionId, returnValue, video);
            }
        }));
        playlist.query.start().then(() => {
            //Backup done call, sometimes it does not trigger automatically from within the downloadQuery.
            playlist.downloaded = true;
            playlist.query.progressBar.done(playlist.audioOnly);
            this.updateGlobalButtons();
        });
    }

    async getSize(identifier, formatLabel, audioOnly, videoOnly, clicked, encoding, audioEncoding) {
        const video = this.getVideo(identifier);
        video.selectedEncoding = encoding;
        video.selectedAudioEncoding = audioEncoding;
        const cachedSize = this.getCachedSize(video, formatLabel, audioOnly, videoOnly);
        if(cachedSize != null) {
            //The size for this format was already looked up
            return cachedSize;
        } else {
            //Size was not already looked up
            //Try looking it up
            if(!clicked && this.environment.settings.sizeMode === "click") {
                //The sizemode is click so when the lookup from renderer is initial it should not do anything.
                return null;
            } else {
                return await this.querySize(video, formatLabel, video.getFormatFromLabel(formatLabel), audioOnly, videoOnly);
            }
        }
    }

    async querySize(video, formatLabel, format, audioOnly, videoOnly) {
        const sizeQuery = new SizeQuery(video, audioOnly, videoOnly, audioOnly ? formatLabel : format, this.environment);
        const result = await sizeQuery.connect();
        if(audioOnly) {
            if(formatLabel === "best") {
                video.bestAudioSize = result
            } else {
                video.worstAudioSize = result
            }
        } else if(videoOnly) {
            const formatCopy = Format.getFromDisplayName(formatLabel);
            formatCopy.filesize = result;
            video.videoOnlySizeCache.push(formatCopy);
        }
        return result;
    }

    getCachedSize(video, formatLabel, audioOnly, videoOnly) {
        if(audioOnly) {
            let applicableSize;
            if (formatLabel === "best") applicableSize = video.bestAudioSize;
            else applicableSize = video.worstAudioSize;
            return applicableSize;
        } else if(videoOnly) {
            const cachedFormat = video.videoOnlySizeCache.find(format => format.getDisplayName() === formatLabel);
            if(cachedFormat != null) return cachedFormat.filesize;
            else return null;
        } else {
            return video.getFormatFromLabel(formatLabel).filesize;
        }
    }

    removeVideo(video) {
        this.managedVideos = this.managedVideos.filter(item => item.identifier !== video.identifier);
        this.playlistMetadata = this.playlistMetadata.filter(item => item.video_url !== video.url);
        this.window.webContents.send("videoAction", { action: "remove", identifier: video.identifier })
        this.environment.logger.clear(video.identifier);
    }

    onError(identifier) {
        let video = this.getVideo(identifier);
        if(video.query != null) {
            video.query.cancel();
        }
        video.error = true;
        this.updateGlobalButtons();
    }

    updateProgress(video, progress_args) {
        let args;
        if(video === "queue") {
            args = {
                action: "totalProgress",
                identifier: video.identifier,
                progress: progress_args
            }
        } else {
            args = {
                action: "progress",
                identifier: video.identifier == null ? video : video.identifier,
                url: video.url,
                progress: progress_args
            }
        }
        try {
            this.window.webContents.send("videoAction", args);
        } catch(e) {
            console.log("Blocked webContents IPC call, the window object was destroyed.");
        }
    }

    async stopDownload(identifier) {
        let video = this.getVideo(identifier);
        if(video == null) {
            return;
        }
        this.cancelPendingRecoveryForVideo(video);
        if(video != null && video.activeRecoveryActionId != null) {
            await this.cancelDownloadAction(video.activeRecoveryActionId, [video]);
        }
        if (video.query != null) {
            await video.query.cancel();
        }
        this.removeVideo(video);
    }

    async openVideo(args) {
        let video = this.getVideo(args.identifier);
        let file = video.filename;
        let fallback = false;
        if(video.type === "playlist") {
            shell.openPath(video.downloadedPath);
            return;
        }
        if(file == null) {
            fs.readdir(video.downloadedPath, (err, files) => {
                for (const searchFile of files) {
                    if (searchFile.substr(0, searchFile.lastIndexOf(".")) === video.getFilename()) {
                        file = searchFile;
                        break;
                    }
                }
                if(file == null) {
                    fallback = true;
                    file = video.getFilename() + ".mp4";
                }
            });
        }
        if(args.type === "folder") {
            if(fallback) {
                shell.openPath(video.downloadedPath);
            } else {
                shell.showItemInFolder(await this.verifyOpenVideoFilepath(video, file));
            }
        } else if(args.type === "item") {
            shell.openPath(await this.verifyOpenVideoFilepath(video, file));
        } else {
            console.error("Wrong openVideo type specified.")
        }
    }

    async verifyOpenVideoFilepath(video, file) {
        const videoPath = path.join(video.downloadedPath, file);
        try {
            await fs.promises.access(videoPath)
            return path.join(video.downloadedPath, file);
        } catch (e) {
            let extension = file.substring(file.lastIndexOf('.'), file.length);
            if(!extension) extension = '.mp4';
            //Fallback to original method if file doesnt exist.
            return path.join(video.downloadedPath, video.getFilename() + extension);
        }
    }

    getUnifiedAvailableSubtitles(videos) {
        let totalSubs = [];
        let totalAutoGen = [];
        for(const video of videos) {
            if(video.subtitles != null && video.subtitles.length !== 0) {
                totalSubs = totalSubs.concat(Object.keys(video.subtitles).map(sub => {
                    return {iso: sub, name: Utils.getNameFromISO(sub)};
                }))
            }
            if(video.autoCaptions != null && video.autoCaptions.length !== 0) {
                totalAutoGen = totalAutoGen.concat(Object.keys(video.autoCaptions).map(sub => {
                    return {iso: sub, name: Utils.getNameFromISO(sub)};
                }))
            }
        }
        const totalSubsDedupe = Utils.dedupeSubtitles(totalSubs);
        const totalAutoGenDedupe = Utils.dedupeSubtitles(totalAutoGen);
        return [totalSubsDedupe.sort(Utils.sortSubtitles), totalAutoGenDedupe.sort(Utils.sortSubtitles)];
    }

    getAvailableSubtitles(identifier, unified) {
        const video = this.getVideo(identifier);
        if(unified) {
            return this.getUnifiedAvailableSubtitles(video.videos);
        }
        let subs = [];
        let autoGen = [];
        if(video.subtitles != null && video.subtitles.length !== 0) {
            subs = Object.keys(video.subtitles).map(sub => {
                return {iso: sub, name: Utils.getNameFromISO(sub)};
            })
        }
        if(video.autoCaptions != null && video.autoCaptions.length !== 0) {
            autoGen = Object.keys(video.autoCaptions).map(sub => {
                return {iso: sub, name: Utils.getNameFromISO(sub)};
            })
        }
        return [subs.sort(Utils.sortSubtitles), autoGen.sort(Utils.sortSubtitles)];
    }

    getSelectedSubtitles(identifier) {
        const video = this.getVideo(identifier);
        return video.selectedSubs;
    }

    showInfo(identifier) {
        let video = this.getVideo(identifier);
        let args = {
            action: "info",
            metadata: video.hasMetadata ? video.serialize() : null,
            identifier: identifier
        };
        this.window.webContents.send("videoAction", args);
    }

    async saveInfo(infoVideo, askPath=true) {
        let video = infoVideo;
        if(video.url == null) video = this.getVideo(infoVideo);
        if (video.url == null) return;
        let result = { filePath: path.join(this.environment.settings.downloadPath, "metadata_" + video.url.slice(-11)) + ".json",  };
        if (askPath) {
            result = await dialog.showSaveDialog(this.window, {
                defaultPath: path.join(this.environment.settings.downloadPath, "metadata_" + video.url.slice(-11)),
                buttonLabel: "Save metadata",
                filters: [
                    {name: "JSON", extensions: ["json"]},
                    {name: "All Files", extensions: ["*"]},
                ],
                properties: ["createDirectory"]
            });
        }
        if(!result.canceled) {
            fs.writeFileSync(result.filePath, JSON.stringify(video.serialize(), null, 3));
        }
    }

    async saveThumb(link) {
        let result = await dialog.showSaveDialog(this.window, {
            defaultPath: path.join(this.environment.settings.downloadPath, "thumb_" + path.basename(url.parse(link).pathname)),
            buttonLabel: "Save thumbnail",
            filters: [
                { name: "Images", extensions: ["jpeg", "jpg", "png", "webp", "tiff", "bmp"] },
                { name: "All Files", extensions: ["*"] },
            ],
            properties: ["createDirectory"]
        });
        if(!result.canceled) {
            const path = result.filePath;
            const writer = fs.createWriteStream(path);
            const response = await axios.get(link,{ responseType: "stream" });
            response.data.pipe(writer);
        }
    }

    updateGlobalButtons() {
        let videos = [];
        for(const video of this.managedVideos) {
            let downloadable = this.isDownloadable(video);
            videos.push({identifier: video.identifier, downloadable: downloadable})
        }
        this.window.webContents.send("updateGlobalButtons", videos);
    }

    setUnifiedSubtitle(videos, args) {
        for(const video of videos) {
            video.downloadSubs = args.enabled;
            video.selectedSubs = [args.subs, args.autoGen];
            video.subLanguages = [...new Set([...args.subs, ...args.autoGen])];
        }
    }

    setSubtitle(args) {
        const video = this.getVideo(args.identifier);
        if(args.unified) {
            this.setUnifiedSubtitle(video.videos, args);
        }
        video.downloadSubs = args.enabled;
        video.selectedSubs = [args.subs, args.autoGen];
        video.subLanguages = [...new Set([...args.subs, ...args.autoGen])];
    }

    setGlobalSubtitle(value) {
        this.environment.mainDownloadSubs = value;
        for(const video of this.managedVideos) {
            video.downloadSubs = value;
        }
    }

    isDownloadable(video) {
        let usedVideo = video;
        if(video.type == null) {
            usedVideo = this.getVideo(video);
        }
        if(usedVideo.videos != null && !usedVideo.downloaded) return true;
        return !(usedVideo == null || usedVideo.type !== "single" || usedVideo.error || usedVideo.downloaded)
    }

    getVideo(identifier) {
        return this.managedVideos.find(item => {
            return item.identifier === identifier;
        });
    }

    getVideoByUrl(searchUrl, predicate = null) {
        return this.managedVideos.find((item) => {
            if(item.url !== searchUrl) {
                return false;
            }
            if(predicate == null) {
                return true;
            }
            return predicate(item);
        });
    }

    buildSubtitleState(video) {
        const selected = video.selectedSubs || [[], []];
        return {
            enabled: video.downloadSubs === true,
            subs: selected[0] || [],
            autoGen: selected[1] || []
        };
    }

    applySubtitleState(video, subtitleState, unified = false) {
        if(subtitleState == null) {
            return;
        }
        const args = {
            enabled: subtitleState.enabled,
            subs: subtitleState.subs || [],
            autoGen: subtitleState.autoGen || []
        };
        if(unified && video.videos != null) {
            this.setUnifiedSubtitle(video.videos, args);
        }
        video.downloadSubs = args.enabled;
        video.selectedSubs = [args.subs, args.autoGen];
        video.subLanguages = [...new Set([...args.subs, ...args.autoGen])];
    }

    buildSingleActionSnapshot(video, args) {
        return {
            type: "single",
            sourceUrls: [video.url],
            request: {
                sourceUrl: video.url,
                type: args.type,
                format: args.format,
                encoding: args.encoding,
                audioEncoding: args.audioEncoding,
                filenameOverride: video.filenameOverride,
                subtitleState: this.buildSubtitleState(video)
            }
        };
    }

    buildUnifiedActionSnapshot(video, args) {
        return {
            type: "unified",
            sourceUrls: [video.url],
            request: {
                sourceUrl: video.url,
                type: args.type,
                format: args.format,
                encoding: args.encoding,
                audioEncoding: args.audioEncoding,
                subtitleState: this.buildSubtitleState(video)
            }
        };
    }

    buildQueueItemSnapshot(video, args, unified) {
        return {
            sourceUrl: video.url,
            unified: unified,
            type: args.type,
            format: args.format,
            encoding: args.encoding,
            audioEncoding: args.audioEncoding,
            filenameOverride: unified ? null : video.filenameOverride,
            subtitleState: this.buildSubtitleState(video)
        };
    }

    registerDownloadAction(actionId, snapshot, videos, totalItems, resumeRecovery = false) {
        const usedActionId = actionId || Utils.getRandomID(16);
        const actionState = {
            id: usedActionId,
            total: totalItems,
            done: 0,
            failed: 0,
            cancelled: 0,
            lastError: null
        };
        this.activeDownloadActions.set(usedActionId, actionState);
        for(const video of videos) {
            video.activeRecoveryActionId = usedActionId;
        }

        const storeEntry = {
            id: usedActionId,
            type: snapshot.type,
            status: "active",
            sourceUrls: snapshot.sourceUrls,
            request: snapshot.request,
            progress: {
                total: totalItems,
                done: 0,
                failed: 0,
                cancelled: 0
            }
        };
        this.environment.downloadRecovery.upsert(storeEntry)
            .then(() => {
                if(resumeRecovery) {
                    return this.environment.downloadRecovery.markResumed(usedActionId);
                }
            })
            .catch((error) => console.error(error));
        return usedActionId;
    }

    recordDownloadActionResult(actionId, returnValue, video) {
        if(actionId == null) {
            return;
        }
        const actionState = this.activeDownloadActions.get(actionId);
        if(actionState == null) {
            return;
        }
        actionState.done++;
        if(returnValue === "killed") {
            actionState.cancelled++;
        } else if(returnValue !== "done") {
            actionState.failed++;
            actionState.lastError = returnValue;
        }
        const progress = {
            total: actionState.total,
            done: actionState.done,
            failed: actionState.failed,
            cancelled: actionState.cancelled
        };
        this.environment.downloadRecovery.markProgress(actionId, progress).catch((error) => console.error(error));
        if(video != null && video.query != null && typeof video.query.getStagingKey === "function") {
            this.environment.downloadRecovery.addStagingKey(actionId, video.query.getStagingKey()).catch((error) => console.error(error));
        }
        if(actionState.done < actionState.total) {
            return;
        }
        if(actionState.failed > 0) {
            this.environment.downloadRecovery.markInterrupted(actionId, {
                progress: progress,
                lastError: actionState.lastError
            }).catch((error) => console.error(error));
        } else {
            this.environment.downloadRecovery.complete(actionId).catch((error) => console.error(error));
        }
        this.activeDownloadActions.delete(actionId);
    }

    async cancelDownloadAction(actionId, videos = []) {
        const entry = this.environment.downloadRecovery.getEntry(actionId);
        const stagingKeys = [];
        for(const video of videos) {
            if(video != null && video.query != null && typeof video.query.getStagingKey === "function") {
                stagingKeys.push(video.query.getStagingKey());
            }
        }
        this.pendingRecoveryActions = this.pendingRecoveryActions.filter((entry) => entry.id !== actionId);
        this.activeDownloadActions.delete(actionId);
        await this.environment.downloadRecovery.cancel(actionId, {
            stagingKeys: stagingKeys
        }).catch((error) => console.error(error));
        if(entry != null && entry.sourceUrls != null) {
            this.playlistMetadata = this.playlistMetadata.filter((item) => !entry.sourceUrls.includes(item.playlist_url) && !entry.sourceUrls.includes(item.video_url));
        }
    }

    async resumeInterruptedDownloads() {
        const recoveryEntries = this.environment.downloadRecovery.getResumableEntries();
        if(recoveryEntries.length === 0) {
            return [];
        }
        this.window.webContents.send("toast", {
            type: "update",
            title: "Resuming interrupted downloads",
            body: `Open Media Downloader Pro found ${recoveryEntries.length} interrupted ${recoveryEntries.length === 1 ? "download" : "downloads"} and is preparing them to resume.`
        });
        for(const entry of recoveryEntries) {
            this.pendingRecoveryActions.push(entry);
            for(const sourceUrl of entry.sourceUrls || []) {
                if(this.getVideoByUrl(sourceUrl) == null) {
                    this.manage(sourceUrl);
                }
            }
        }
        this.tryStartPendingRecoveryActions();
        return recoveryEntries;
    }

    tryStartPendingRecoveryActions() {
        const remaining = [];
        for(const entry of this.pendingRecoveryActions) {
            if(this.startRecoveryEntry(entry)) {
                continue;
            }
            remaining.push(entry);
        }
        this.pendingRecoveryActions = remaining;
    }

    startRecoveryEntry(entry) {
        switch(entry.type) {
            case "single": {
                const video = this.getVideoByUrl(entry.request.sourceUrl, (item) => item.type === "single");
                if(video == null || video.error) {
                    return false;
                }
                this.applySubtitleState(video, entry.request.subtitleState);
                this.downloadVideo({
                    identifier: video.identifier,
                    format: entry.request.format,
                    encoding: entry.request.encoding,
                    audioEncoding: entry.request.audioEncoding,
                    filenameOverride: entry.request.filenameOverride,
                    type: entry.request.type,
                    subtitleState: entry.request.subtitleState,
                    recoveryActionId: entry.id,
                    snapshot: entry,
                    resumeRecovery: true
                });
                return true;
            }
            case "unified": {
                const playlist = this.getVideoByUrl(entry.request.sourceUrl, (item) => item.videos != null);
                if(playlist == null || playlist.error) {
                    return false;
                }
                this.applySubtitleState(playlist, entry.request.subtitleState, true);
                this.downloadUnifiedPlaylist({
                    identifier: playlist.identifier,
                    format: entry.request.format,
                    encoding: entry.request.encoding,
                    audioEncoding: entry.request.audioEncoding,
                    type: entry.request.type,
                    subtitleState: entry.request.subtitleState,
                    recoveryActionId: entry.id,
                    snapshot: entry,
                    resumeRecovery: true
                });
                return true;
            }
            case "queue": {
                const videos = [];
                for(const item of entry.request.videos) {
                    const resolved = this.getVideoByUrl(item.sourceUrl, (video) => item.unified ? video.videos != null : video.type === "single");
                    if(resolved == null || resolved.error) {
                        return false;
                    }
                    this.applySubtitleState(resolved, item.subtitleState, item.unified);
                    const resolvedArgs = {
                        identifier: resolved.identifier,
                        type: item.type,
                        format: item.format,
                        encoding: item.encoding,
                        audioEncoding: item.audioEncoding,
                        filenameOverride: item.filenameOverride,
                        downloadSubs: item.subtitleState != null ? item.subtitleState.enabled : false,
                        subtitleState: item.subtitleState
                    };
                    if(item.unified) {
                        resolvedArgs.url = resolved.url;
                    }
                    videos.push(resolvedArgs);
                }
                this.downloadAllVideos({
                    videos: videos,
                    recoveryActionId: entry.id,
                    snapshot: entry,
                    resumeRecovery: true
                });
                return true;
            }
            default:
                return true;
        }
    }

    getTaskList(excludedUrls = []) {
        const urlList = []
        const filteredUrlList = [];
        const excluded = new Set(excludedUrls);
        for(const video of this.managedVideos) {
            if(excluded.has(video.url)) continue;
            urlList.push(video.url)
        }
        for(const video of this.playlistMetadata) {
            for(let i = 0; i < urlList.length; i++) {
                if(urlList[i] === video.video_url || urlList[i] === video.playlist_url) {
                    urlList.splice(i, 1);
                    i--;
                    filteredUrlList.push(video.playlist_url);
                } else {
                    filteredUrlList.push(urlList[i]);
                }
            }
        }
        const dedupedFilteredUrlList = [...new Set(filteredUrlList)];
        if(dedupedFilteredUrlList.length === 0) {
            return urlList;
        } else {
            return dedupedFilteredUrlList;
        }
    }

    loadTaskList(taskList) {
        let count = 0;
        for(const url of taskList) {
            this.manage(url);
            count++;
        }
        console.log("Added " + count + " saved tasks.")
    }

    isManagedVideo(identifier) {
        return this.getVideo(identifier) != null;
    }

    cancelPendingRecoveryForVideo(video) {
        if(video == null || video.url == null) {
            return;
        }
        const matchedEntries = this.pendingRecoveryActions.filter((entry) => (entry.sourceUrls || []).includes(video.url));
        this.pendingRecoveryActions = this.pendingRecoveryActions.filter((entry) => !(entry.sourceUrls || []).includes(video.url));
        for(const entry of matchedEntries) {
            this.environment.downloadRecovery.cancel(entry.id).catch((error) => console.error(error));
        }
    }

}
module.exports = QueryManager;
