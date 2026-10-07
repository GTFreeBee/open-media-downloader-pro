const { clipboard } = require('electron');
const {getSafeExternalUrl} = require('./ExternalNavigation');

class ClipboardWatcher {
    constructor(win, env) {
        this.win = win;
        this.env = env;
    }

    startPolling() {
        this.poll();
        this.pollId = setInterval(() => this.poll(), 1000);
    }

    resetPlaceholder() {
        const standard = "Enter a video/playlist URL to add to the queue";
        this.updatePlaceholder(standard, false);
    }

    updatePlaceholder(text, copied) {
        const state = `${copied}:${text}`;
        if(this.placeholderState === state) return;
        this.placeholderState = state;
        if(this.win != null) this.win.webContents.send("updateLinkPlaceholder", {text, copied});
    }

    poll() {
        if(this.env.settings.autoFillClipboard) {
            const clipboardValue = clipboard.readText();
            if (typeof clipboardValue !== "string") {
                this.resetPlaceholder();
                return;
            }
            const text = clipboardValue.trim();
            if (text.length === 0) {
                this.resetPlaceholder();
                return;
            }
            const safeUrl = getSafeExternalUrl(text);
            if (safeUrl != null) {
                this.updatePlaceholder(safeUrl, true);
            } else {
                this.resetPlaceholder();
            }
        }
    }
}

module.exports = ClipboardWatcher;
