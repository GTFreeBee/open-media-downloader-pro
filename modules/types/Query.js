const execa = require('execa');

class Query {
    constructor(environment, identifier) {
        this.environment = environment;
        this.identifier = identifier
        this.process = null;
        this.stopped = false;
        this.lineBuffers = { stdout: "", stderr: "" };
    }

    stop() {
        this.stopped = true;
        if(this.process != null) {
            this.process.cancel();
        }
    }

    cancel() {
        this.stop();
    }

    async start(url, args, cb) {
        if(this.stopped) return "killed";
        args.push("--no-cache-dir");
        args.push("--ignore-config");
        args.push(...await this.environment.getYtDlpRuntimeArgs());

        args.push("--encoding", "utf-8", "--socket-timeout", "30");
        if(this.stopped) return "killed";
        if(this.environment.settings.userAgent === "empty") {
            args.push("--user-agent");
            args.push("");
        }

        if(this.environment.settings.proxy != null && this.environment.settings.proxy.length > 0) {
            args.push("--proxy");
            args.push(this.environment.settings.proxy);
        }

        if(!this.environment.settings.validateCertificate) {
            args.push("--no-check-certificate"); //Dont check the certificate if validate certificate is false
        }

        if(this.environment.settings.cookiePath != null) { //Add cookie arguments if enabled
            args.push("--cookies");
            args.push(this.environment.settings.cookiePath);
        }

        if(this.environment.settings.rateLimit !== "") {
            args.push("--limit-rate");
            args.push(this.environment.settings.rateLimit + "K");
        }

        if(this.environment.settings.noPlaylist) {
            args.push("--no-playlist");
        } else {
            args.push("--yes-playlist")
        }

        args.push(url) //Url must always be added as the final argument

        let command = this.environment.paths.ytdl; //Set the command to be executed

        if(this.environment.pythonCommand !== "python") { //If standard python is not available use another install if detected
            args.unshift(this.environment.paths.ytdl);
            command = this.environment.pythonCommand;
        }
        if(cb == null) {
            //Return the data after the query has completed fully.
            try {
                this.process = execa(command, args, { windowsHide: true });
                const {stdout} = await this.process;
                return stdout
            } catch(e) {
                if(this.stopped || e.isCanceled) {
                    return "killed";
                }
                if(!this.environment.errorHandler.checkError(e.stderr, this.identifier)) {
                    if(!this.environment.errorHandler.checkError(e.shortMessage, this.identifier)) {
                        this.environment.errorHandler.raiseUnhandledError("Unhandled error (execa)", JSON.stringify(e, null, 2), this.identifier);
                    }
                }
                return "{}";
            }
        } else {
            //Return data while the query is running (live)
            //Return "done" when the query has finished
            return await new Promise((resolve) => {
                let settled = false;
                let stderr = "";
                this.lineBuffers = { stdout: "", stderr: "" };
                this.process = execa(command, args, { windowsHide: true });
                this.process.stdout.setEncoding('utf8');
                this.process.stderr.setEncoding('utf8');
                this.process.stdout.on('data', (data) => {
                    this.emitLiveLines(data, cb);
                });
                this.process.stderr.on("data", (data) => {
                    const line = data.toString();
                    stderr += line;
                    this.emitLiveLines(line, cb, "stderr");
                    console.error(line);
                });
                this.process.then(() => {
                    if(settled) return;
                    settled = true;
                    this.flushLiveLines(cb);
                    if(this.stopped || this.process.killed) {
                        cb("killed");
                        resolve("killed");
                        return;
                    }
                    cb("done");
                    resolve("done");
                }).catch((error) => {
                    if(settled) return;
                    settled = true;
                    this.flushLiveLines(cb);
                    if(this.stopped || error.isCanceled || this.process.killed) {
                        cb("killed");
                        resolve("killed");
                        return;
                    }
                    const errorOutput = stderr || error.all || error.stderr || error.shortMessage || "killed";
                    cb("killed");
                    resolve(errorOutput);
                });
            });
        }
    }

    emitLiveLines(data, cb, stream = "stdout") {
        const lines = (this.lineBuffers[stream] + data.toString()).split(/\r\n|\n|\r/);
        this.lineBuffers[stream] = lines.pop();
        for(const line of lines) {
            if(line.length > 0) cb(line);
        }
    }

    flushLiveLines(cb) {
        for(const stream of ["stdout", "stderr"]) {
            if(this.lineBuffers[stream]) cb(this.lineBuffers[stream]);
            this.lineBuffers[stream] = "";
        }
    }

}
module.exports = Query;
