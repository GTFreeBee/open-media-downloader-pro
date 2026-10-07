const Query = require("../modules/types/Query");
const execa = require('execa');
const { PassThrough } = require('stream');

jest.mock('execa');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('ytdl Query', () => {
    beforeEach(() => {
        execa.mockResolvedValue({stdout: "fake-data"});
    });
    it('uses downloader defaults for legacy spoof settings', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("spoof", null, errorHandlerMock, "python");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1]).not.toContain("--user-agent");

        });
    });
    it('adds an empty user agent when this setting is enabled', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("empty", null, errorHandlerMock, "python");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1]).toContain("--user-agent");
            expect(execa.mock.calls[0][1]).toContain("");
        });
    });
   it('adds the proxy when one is set', () => {
       const errorHandlerMock = jest.fn();
       const instance = instanceBuilder("default", "a/path/to/cookies.txt", errorHandlerMock, "python", "https://iama.proxy");
       return instance.start("https://url.link", [], null).then(() => {
           expect(execa.mock.calls[0][1]).toContain("--proxy");
           expect(execa.mock.calls[0][1]).toContain("https://iama.proxy");
       });
   })
    it('does not add a proxy when none are set', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", "a/path/to/cookies.txt", errorHandlerMock, "python", "");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1]).not.toContain("--proxy");
        });
    })
   it('adds the cookies argument when specified in settings', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", "a/path/to/cookies.txt", errorHandlerMock, "python");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1]).toContain("--cookies");
            expect(execa.mock.calls[0][1]).toContain("a/path/to/cookies.txt");
        });
    });
    it('uses the detected python command', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python3");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][0]).toEqual("python3");
            expect(execa.mock.calls[0][1][0]).toEqual("a/path/to/ytdl");
        });
    });
    it('adds the url as final argument', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1][execa.mock.calls[0][1].length - 1]).toContain("https://url.link");
        });
    })
    it('adds the no-cache-dir as argument', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1]).toContain("--no-cache-dir");
        });
    });
    it('adds explicit yt-dlp JavaScript runtime arguments when available', () => {
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python", "", ["--js-runtimes", "deno:C:/runtime/deno.exe"]);
        return instance.start("https://url.link", [], null).then(() => {
            expect(execa.mock.calls[0][1]).toContain("--js-runtimes");
            expect(execa.mock.calls[0][1]).toContain("deno:C:/runtime/deno.exe");
        });
    });
})

describe('Query with live callback', () => {
    it('buffers split JSON lines without rewriting escaped Unicode', async () => {
        const [stdout, stderr, mock, reject, resolve] = execaMockBuilder();
        execa.mockReturnValue(mock);
        const callback = jest.fn();
        const instance = instanceBuilder("default", null, jest.fn(), "python");
        const result = instance.start("https://url.link", [], callback);
        await new Promise(setImmediate);
        const line = '__OMDP_FILE__"C:\\\\music\\\\Title \\uFF5C \\u0022quote\\u0022.mp3"';
        stdout.write(line.slice(0, 20));
        stderr.write("WARNING: separate stream\n");
        stdout.write(line.slice(20) + "\nlast line");
        resolve({stdout: ""});
        await result;
        expect(callback).toHaveBeenCalledWith(line);
        expect(callback).toHaveBeenCalledWith("last line");
        expect(callback).toHaveBeenCalledWith("WARNING: separate stream");
    });
    it('cancels a metadata process that is already running', async () => {
        const [stdout, stderr, mock, reject] = execaMockBuilder();
        execa.mockReturnValue(mock);
        const instance = instanceBuilder("default", null, jest.fn(), "python");
        const result = instance.start("https://url.link", [], null);
        await new Promise(setImmediate);
        instance.stop();
        reject(Object.assign(new Error("Cancelled"), {isCanceled: true}));
        await expect(result).resolves.toBe("killed");
        expect(mock.cancel).toHaveBeenCalled();
    });
    it('Stops with return value killed when stop() is called', async () => {
        const [stdout, stderr, mock, reject] = execaMockBuilder();
        execa.mockReturnValue(mock);
        const callbackMock = jest.fn();
        const instance = instanceBuilder("default", null, jest.fn(), "python");
        const result = instance.start("https://url.link", [], callbackMock);
        setTimeout(() => {
            instance.stop();
            reject(Object.assign(new Error("Cancelled"), { isCanceled: true }));
        }, 100);
        await expect(result).resolves.toEqual("killed");
        expect(callbackMock).toBeCalledWith("killed");
    });
    it('returns collected stderr when the process exits with an error', async () => {
        const [stdout, stderr, mock, reject] = execaMockBuilder();
        execa.mockReturnValue(mock);
        console.error = jest.fn();
        const callbackMock = jest.fn();
        const instance = instanceBuilder("default", null, jest.fn(), "python");
        const result = instance.start("https://url.link", [], callbackMock);
        setTimeout(() => {
            stderr.emit("data", "test-error");
            reject(new Error("test-error"));
        }, 100);
        await expect(result).resolves.toEqual("test-error");
        expect(callbackMock).toBeCalledWith("test-error");
        expect(callbackMock).toBeCalledWith("killed");
    });
    it('Resolves "done" when query was successful', async () => {
        const [stdout, stderr, mock, reject, resolve] = execaMockBuilder();
        execa.mockReturnValue(mock);
        const callbackMock = jest.fn();
        const instance = instanceBuilder("default", null, jest.fn(), "python");
        const result = instance.start("https://url.link", [], callbackMock);
        setTimeout(() => {
            resolve({stdout: ""});
        }, 100);
        await expect(result).resolves.toEqual("done");
        expect(callbackMock).toBeCalledWith("done");
    });
    it('Sends live stdout to the callback', async () => {
        const [stdout, stderr, mock, reject, resolve] = execaMockBuilder();
        execa.mockReturnValue(mock);
        const callbackMock = jest.fn();
        const instance = instanceBuilder("default", null, jest.fn(), "python");
        const result = instance.start("https://url.link", [], callbackMock);
        setTimeout(() => {
            stdout.emit("data", "test-data\n");
            stdout.emit("data", "more-test-data\n");
            resolve({stdout: ""});
        }, 100);
        await result;
        expect(callbackMock).toBeCalledWith("test-data");
        expect(callbackMock).toBeCalledWith("more-test-data");
    });
    it('does not fail early on retryable stderr if the process eventually succeeds', async () => {
        const [stdout, stderr, mock, reject, resolve] = execaMockBuilder();
        execa.mockReturnValue(mock);
        const errorHandlerMock = jest.fn();
        const callbackMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        const result = instance.start("https://url.link", [], callbackMock);
        setTimeout(() => {
            stderr.emit("data", "HTTP Error 429. Retrying fragment 1");
            stdout.emit("data", "still-going");
            resolve({stdout: ""});
        }, 100);
        await expect(result).resolves.toEqual("done");
        expect(errorHandlerMock).not.toBeCalled();
        expect(callbackMock).toBeCalledWith("still-going");
        expect(callbackMock).toBeCalledWith("done");
    });
});

describe('Query without callback', () => {
    it('Returns the data from the execa call', async () => {
        execa.mockResolvedValue({stdout: "fake-data"});
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        const result = instance.start("https://url.link", [], null)
        await expect(result).resolves.toEqual("fake-data");
    });
    it('Returns a stringified empty object on error', async () => {
        execa.mockResolvedValue(null);
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        const result = instance.start("https://url.link", [], null)
        await expect(result).resolves.toEqual("{}");
    });
    it('Checks the error on error', () => {
        execa.mockResolvedValue(null);
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        return instance.start("https://url.link", [], null).then(() => {
            expect(errorHandlerMock).toBeCalled();
        });
    });
    it('Returns killed without reporting an error when a non-live query is cancelled', async () => {
        execa.mockRejectedValue(Object.assign(new Error("Cancelled"), { isCanceled: true }));
        const errorHandlerMock = jest.fn();
        const instance = instanceBuilder("default", null, errorHandlerMock, "python");
        instance.stop();
        await expect(instance.start("https://url.link", [], null)).resolves.toEqual("killed");
        expect(errorHandlerMock).not.toBeCalled();
    });
})

function execaMockBuilder() {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    promise.stdout = stdout;
    promise.stderr = stderr;
    promise.killed = false;
    promise.cancel = jest.fn(() => {
        promise.killed = true;
    });
    return [stdout, stderr, promise, rejectPromise, resolvePromise];
}

function instanceBuilder(userAgent, cookiePath, errorHandlerMock, pythonCommand, proxy, runtimeArgs = []) {
    return new Query({
        pythonCommand: pythonCommand,
        errorHandler: {checkError: errorHandlerMock,  raiseUnhandledError: errorHandlerMock},
        getYtDlpRuntimeArgs: jest.fn().mockResolvedValue(runtimeArgs),
        paths: {ytdl: "a/path/to/ytdl"},
        settings: {cookiePath: cookiePath, userAgent, proxy: proxy}
    }, "test__id");
}
