const Utils = require("../Utils");
const Path = require("path");
const fs = require("fs").promises;

class ErrorHandler {
    constructor(win, queryManager, env) {
        this.env = env;
        this.queryManager = queryManager;
        this.win = win;
        this.unhandledErrors = [];
        this.errorDefinitions = [];
        this.loadErrorDefinitions().then(errorDefs => this.errorDefinitions = errorDefs);
    }

    checkError(errorOutput, identifier) {
        let stderr = errorOutput;
        let foundError = false;
        if(stderr == null) {
            console.error("An error has occurred but no error message was given.")
            return false;
        }
        stderr = typeof stderr === "string" ? stderr : (stderr.message || String(stderr));
        if(stderr.trim().startsWith("WARNING:") && !stderr.includes("ERROR:")) {
            console.warn(stderr);
            return;
        }
        for(const errorDef of this.errorDefinitions) {
            if(Array.isArray(errorDef.trigger)) {
                for(const trigger of errorDef.trigger) {
                    if(stderr.includes(trigger)) {
                        if(errorDef.code === "ffmpeg not found" && process.argv[2] === '--dev') return false; //Do not raise a 'ffmpeg not found' error when in dev mode
                        if(errorDef.code === "Thumbnail embedding not supported") return false; //Do not raise an error when thumbnails can't be embedded due to unsupported container
                        foundError = true;
                        this.raiseError({ ...errorDef, trigger }, identifier);
                        break;
                    }
                }
                if(foundError) break;
            } else if(stderr.includes(errorDef.trigger)) {
                if(errorDef.code === "ffmpeg not found" && process.argv[2] === '--dev') return false; //Do not raise a 'ffmpeg not found' error when in dev mode
                if(errorDef.code === "Thumbnail embedding not supported") return false; //Do not raise an error when thumbnails can't be embedded due to unsupported container
                foundError = true;
                this.raiseError(errorDef, identifier);
                break;
            }
        }
        if(!foundError) {
            if(stderr.includes("ERROR")) {
                foundError = true;
                console.error(stderr)
                this.raiseUnhandledError(stderr, stderr, identifier);
            }
        }
        return foundError;
    }

    raiseUnhandledError(code, error, identifier) {
        const video = this.queryManager.getVideo(identifier);
        if(video == null) return;
        if(code.includes("[debug]")) return;
        if(video.type === "playlist") return;
        let errorDef = {
            identifier: identifier,
            url: video.url ,
            error_id: Utils.getRandomID(8),
            unexpected: true,
            error: {
                code: error === code ? "Unhandled error" : code,
                description: error,
            }
        };
        this.win.webContents.send("error", errorDef);
        this.unhandledErrors.push(errorDef);
        if(this.env.logger != null && typeof this.env.logger.persistFailure === "function") {
            this.env.logger.persistFailure(identifier, {
                code: errorDef.error.code,
                description: errorDef.error.description,
                url: video.url
            }).catch((persistError) => console.error(persistError));
        }
        this.queryManager.onError(identifier);
    }

    raiseError(errorDef, identifier) {
        const video = this.queryManager.getVideo(identifier);
        if(video == null) return;
        if(video.type === "playlist") return;
        console.error(errorDef.code + " - " + errorDef.description);
        this.win.webContents.send("error", { error: errorDef, identifier: identifier, unexpected: false, url: video.url });
        if(this.env.logger != null && typeof this.env.logger.persistFailure === "function") {
            this.env.logger.persistFailure(identifier, {
                code: errorDef.code,
                description: errorDef.description,
                url: video.url
            }).catch((persistError) => console.error(persistError));
        }
        this.queryManager.onError(identifier);
    }

    async loadErrorDefinitions() {
        try {
            let path = Path.join(this.env.paths.packedPrefix, "/modules/exceptions/errorDefinitions.json");
            if(!this.env.paths.app.isPackaged) {
                path = "modules/exceptions/errorDefinitions.json"
            }
            const data = await fs.readFile(path);
            return JSON.parse(data.toString());
        } catch (e) {
            console.error("Failed loading error definitions.")
            console.error(e);
        }
    }
}

module.exports = ErrorHandler;
