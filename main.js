const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron');
const Environment = require('./modules/Environment');
const path = require('path');
const QueryManager = require("./modules/QueryManager");
const ErrorHandler = require("./modules/exceptions/ErrorHandler");
const BinaryUpdater = require("./modules/BinaryUpdater");
const TaskList = require("./modules/persistence/TaskList");
const DoneAction = require("./modules/DoneAction");
const ClipboardWatcher = require("./modules/ClipboardWatcher");
const FfmpegUpdater = require('./modules/FfmpegUpdater');
const YtDlpJsRuntime = require("./modules/YtDlpJsRuntime");
const fs = require("fs");
const { getSafeExternalUrl } = require("./modules/ExternalNavigation");
const FilenameOverride = require("./modules/FilenameOverride");

let win
let env
let queryManager
let clipboardWatcher
let taskList
let appStarting = true;
let quitSaved = false;
let quitSaving = false;

if(!app.requestSingleInstanceLock()) {
    app.quit();
}
app.on('second-instance', () => {
    if(win != null) {
        if(win.isMinimized()) win.restore();
        win.show();
        win.focus();
    }
});

function sendLogToRenderer(log, isErr) {
    if(win == null) return;
    win.webContents.send("log", {log: log, isErr: isErr});
}

function startSessionFeatures(env) {
    const excludedUrls = env.downloadRecovery.getTrackedUrls();
    if(env.settings.taskList) {
        taskList.load(excludedUrls);
    }
    env.downloadRecovery.cleanupOrphanedStaging()
        .then((result) => {
            if(result.cleaned > 0) {
                console.log(`Cleaned ${result.cleaned} stale staging folder(s).`);
            }
        })
        .catch((error) => console.error(error));
    queryManager.resumeInterruptedDownloads()
        .catch((error) => console.error(error));
    if(env.paths.isLikelySyncFolder(env.settings.downloadPath) && env.settings.maxConcurrent > 2) {
        win.webContents.send("toast", {
            type: "update",
            title: "Sync folder detected",
            body: "The current download folder looks like a synced location, so active downloads are being capped at 2 jobs for stability."
        });
    }
    clipboardWatcher.startPolling();
}

async function startBinaryUpdates(env) {
    const binaryUpdater = new BinaryUpdater(env.paths, win);
    const ffmpegUpdater = new FfmpegUpdater(env.paths, win);
    env.ytDlpJsRuntime = env.ytDlpJsRuntime || new YtDlpJsRuntime(env.paths, win);
    env.ytDlpJsRuntime.win = win;
    const [hasYtdlpFallback, hasFfmpegFallback] = await Promise.all([
        binaryUpdater.hasUsableBinary(),
        ffmpegUpdater.hasUsableBinary()
    ]);
    const canUseExistingTools = hasYtdlpFallback && hasFfmpegFallback;

    if(!canUseExistingTools) {
        win.webContents.send("binaryLock", {lock: true, placeholder: "Checking required media tools..."});
    }

    try {
        await ffmpegUpdater.checkUpdate({blockingUi: !canUseExistingTools});
        await binaryUpdater.checkUpdate({blockingUi: !canUseExistingTools});
        await env.ytDlpJsRuntime.checkUpdate({blockingUi: false});
    } catch (error) {
        console.error(error);
    } finally {
        if(!canUseExistingTools) {
            win.webContents.send("binaryLock", {lock: false});
            const [ytdlpAvailable, ffmpegAvailable] = await Promise.all([
                binaryUpdater.hasUsableBinary(),
                ffmpegUpdater.hasUsableBinary()
            ]);
            if(!ytdlpAvailable || !ffmpegAvailable) {
                win.webContents.send("toast", {
                    type: "update",
                    title: "Required tools are unavailable",
                    body: "Startup updates could not finish. The app will retry next time it opens, but downloads may be unavailable until the connection is stable again."
                });
            }
        }

        if (!await env.ytDlpJsRuntime.hasUsableRuntime()) {
            win.webContents.send("toast", {
                type: "warning",
                title: "JavaScript runtime unavailable",
                body: "YouTube compatibility may be limited until the JavaScript runtime finishes downloading or a supported runtime is installed."
            });
        }
    }
}

function startCriticalHandlers(env) {
     env.win = win;

    win.on('maximize', () => {
        win.webContents.send("maximized", true)
    });

    win.on('unmaximize', () => {
        win.webContents.send("maximized", false)
    });

    //Force links with target="_blank" to be opened in an external browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
        const safeUrl = getSafeExternalUrl(url);
        if (safeUrl != null) {
            shell.openExternal(safeUrl).catch((error) => console.error(error));
        }
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
        if (url !== win.webContents.getURL()) {
            event.preventDefault();
        }
    });

    clipboardWatcher = new ClipboardWatcher(win, env);

    queryManager = new QueryManager(win, env);

    taskList = new TaskList(env.paths, queryManager)

    env.errorHandler = new ErrorHandler(win, queryManager, env);

    if(env.settings.updateBinary) {
        startSessionFeatures(env);
        startBinaryUpdates(env).catch((error) => {
            console.error(error);
        });
    } else {
        startSessionFeatures(env);
    }

    //Send the saved download type to the renderer
    win.webContents.send("videoAction", {action: "setDownloadType", type: env.settings.downloadType});

    if(appStarting) {
        appStarting = false;

        //Restore the videos from last session
        ipcMain.handle("restoreTaskList", () => {
            taskList.restore()
        });

        //Send the log for a specific download to renderer
        ipcMain.handle("getLog", async (event, identifier) => {
            return await env.logger.getCombined(identifier);
        });

        //Save the log when renderer asks main
        ipcMain.handle("saveLog", (event, identifier) => {
            return env.logger.save(identifier);
        })

        ipcMain.handle("openDiagnosticsFolder", async () => {
            const diagnosticsDir = env.logger.getDiagnosticsDir();
            await fs.promises.mkdir(diagnosticsDir, { recursive: true });
            return await shell.openPath(diagnosticsDir);
        });

        ipcMain.handle("copyFailureReport", async (event, identifier) => {
            const report = await env.logger.buildFailureReport(identifier);
            clipboard.writeText(report);
            return report;
        });

        //Catch all console.log calls, print them to stdout and send them to the renderer devtools.
        console.log = (arg) => {
            process.stdout.write(arg + "\n");
            sendLogToRenderer(arg, false);
        };

        //Catch all console.error calls, print them to stderr and send them to the renderer devtools.
        console.error = (arg) => {
            process.stderr.write(arg + "\n");
            sendLogToRenderer(arg, true);
        }

        ipcMain.handle('iconProgress', (event, args) => {
            win.setProgressBar(args);
            if(args === 1) {
                if(process.platform === "darwin") app.dock.bounce();
                else win.flashFrame(true);
                win.setProgressBar(-1);
            }
        });

        ipcMain.handle('settingsAction', (event, args) => {
            switch (args.action) {
                case "get":
                    return env.settings.serialize();
                case "save":
                    env.settings.update(args.settings);
                    break;
            }
        })

        ipcMain.handle('setDoneAction', (event, args) => {
            env.doneAction = args.action;
        });

        ipcMain.handle('getSubtitles', (event, args) => {
            return queryManager.getAvailableSubtitles(args.identifier, args.unified);
        });

        ipcMain.handle('getSelectedSubtitles', (event, args) => {
            return queryManager.getSelectedSubtitles(args.identifier);
        });

        ipcMain.handle('videoAction', async (event, args) => {
            switch (args.action) {
                case "stop":
                    await queryManager.stopDownload(args.identifier);
                    break;
                case "open":
                    queryManager.openVideo(args);
                    break;
                case "download":
                    if (args.downloadType === "all") queryManager.downloadAllVideos(args)
                    else if(args.downloadType === "unified") queryManager.downloadUnifiedPlaylist(args);
                    else if(args.downloadType === "single") queryManager.downloadVideo(args);
                    break;
                case "entry":
                    {
                        const safeUrl = getSafeExternalUrl(args.url);
                        if (safeUrl == null) {
                            win.webContents.send("toast", {
                                type: "warning",
                                title: "Unsupported address",
                                body: "Enter a complete HTTP or HTTPS address."
                            });
                            return false;
                        }
                        queryManager.manage(safeUrl);
                        return true;
                    }
                case "info":
                    queryManager.showInfo(args.identifier);
                    break;
                case "downloadInfo":
                    queryManager.saveInfo(args.identifier);
                    break;
                case "downloadThumb":
                    {
                        const safeUrl = getSafeExternalUrl(args.url);
                        if (safeUrl != null) queryManager.saveThumb(safeUrl);
                        break;
                    }
                case "getSize":
                    return await queryManager.getSize(args.identifier, args.formatLabel, args.audioOnly, args.videoOnly, args.clicked, args.encoding, args.audioEncoding);
                case "setSubtitles":
                    queryManager.setSubtitle(args);
                    break;
                case "globalSubtitles":
                    queryManager.setGlobalSubtitle(args.value);
                    break;
                case "downloadable":
                    return await queryManager.isDownloadable(args.identifier);
                case "normalizeFilename":
                    return FilenameOverride.normalize(args.value);
            }
        });
    }
}

//Create the window for the renderer process
function createWindow(env) {
    win = new BrowserWindow({
        show: false,
        minWidth: 840,
        minHeight: 650,
        width: 860,
        height: 840,
        backgroundColor: env.settings.theme === "dark" ? '#212121' : '#ffffff',
        titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
        frame: false,
        icon: env.paths.icon,
        webPreferences: {
            nodeIntegration: false,
            spellcheck: false,
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true
        }
    })
    if(process.argv[2] === '--dev') {
        win.webContents.openDevTools()
    }
    win.loadFile(path.join(__dirname, "renderer/renderer.html"))
    win.on('closed', () => {
        win = null
    })
    win.once('focus', () => win.flashFrame(false))
    win.webContents.on('did-finish-load', () => {
        win.show();
        startCriticalHandlers(env)
    });
}

app.on('ready', async () => {
    app.setAppUserModelId("com.glentertainment.open-media-downloader-pro");
    env = new Environment(app);
    await env.initialize();
    createWindow(env);
})

app.on('before-quit', async (event) => {
    if(quitSaved || taskList == null) return;
    event.preventDefault();
    if(quitSaving) return;
    quitSaving = true;
    try {
        await taskList.save(env.downloadRecovery.getTrackedUrls());
        await env.downloadRecovery.saveQueue;
    } catch (error) {
        console.error("Could not save the queue before exit:", error);
    } finally {
        quitSaved = true;
        app.quit();
    }
})

//Quit the application when all windows are closed, except for darwin
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

//Create a window when there is none, but the app is still active (darwin)
app.on('activate', () => {
    if (win === null) {
        createWindow(env)
    }
});

//Creates the input menu to show on right click
const InputMenu = Menu.buildFromTemplate([
    {
        label: 'Cut',
        role: 'cut',
    },
    {
        label: 'Copy',
        role: 'copy',
    },
    {
        label: 'Paste',
        role: 'paste',
    },
    {
        type: 'separator',
    },
    {
        label: 'Select all',
        role: 'selectall',
    },
]);

//Opens the input menu when ordered from renderer process
ipcMain.handle('openInputMenu', () => {
    InputMenu.popup(win);
})

ipcMain.handle('openCopyMenu', (event, content) => {
    const CopyMenu = Menu.buildFromTemplate([
        {
            label: 'Copy link address',
            click: () => {
                clipboard.writeText(content);
            }
        }
    ]);
    CopyMenu.popup(win);
})

//Return the platform to the renderer process
ipcMain.handle("platform", () => {
    return process.platform;
})


//Return the available actions to the renderer process
ipcMain.handle('getDoneActions', () => {
    const doneAction = new DoneAction();
    return doneAction.getActions();
});

//Return the user selected theme to the renderer process
ipcMain.handle("theme", () => {
    return env.settings.theme;
})

//Handle titlebar click events from the renderer process
ipcMain.handle('titlebarClick', (event, arg) => {
    if(arg === 'close') {
        win.close()
    } else if(arg === "minimize") {
        win.minimize()
    } else if(arg === "maximize") {
        if(win.isMaximized()) win.unmaximize();
        else win.maximize();
    }
})

//Show a dialog to select a folder, and return the selected value.
ipcMain.handle('downloadFolder', async () => {
    await dialog.showOpenDialog(win, {
        defaultPath:  env.settings.downloadPath,
        buttonLabel: "Set download location",
        properties: [
            'openDirectory',
            'createDirectory'
        ]
    }).then(result => {
        if(result.filePaths[0] != null) {
            env.settings.downloadPath = result.filePaths[0];
            env.settings.save();
            env.changeMaxConcurrent(env.settings.maxConcurrent);
            if(env.paths.isLikelySyncFolder(env.settings.downloadPath) && env.settings.maxConcurrent > 2) {
                win.webContents.send("toast", {
                    type: "update",
                    title: "Sync folder detected",
                    body: "This download folder looks synced by Dropbox, OneDrive, or a similar service, so active downloads are being capped at 2 jobs for better reliability."
                });
            }
        }
    });
});

//Show a dialog to select a file, and return the selected value.
ipcMain.handle('cookieFile', async (event,clear) => {
    if(clear === true) {
        env.settings.cookiePath = null;
        env.settings.save();
        return;
    } else if(clear === "get") {
        return env.settings.cookiePath;
    }
    let result = await dialog.showOpenDialog(win, {
        buttonLabel: "Select file",
        defaultPath: (env.settings.cookiePath != null) ? env.settings.cookiePath : env.settings.downloadPath,
        properties: [
            'openFile',
            'createDirectory'
        ],
        filters: [
            { name: "txt", extensions: ["txt"] },
            { name: "All Files", extensions: ["*"] },
        ],
    });
    if(result.filePaths[0] != null) {
        env.settings.cookiePath = result.filePaths[0];
        env.settings.save();
    }
    return result.filePaths[0];
})

//Show a messagebox with a custom title and message
ipcMain.handle('messageBox', (event, args) => {
    dialog.showMessageBoxSync(win, {
        title: args.title,
        message: (typeof args.message === "string" && args.message.includes("returned an empty object")) ? "The downloader backend returned an empty response." : args.message,
        type: "none",
        buttons: [],
    });
});


