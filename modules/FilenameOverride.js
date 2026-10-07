const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;
const MAX_BASENAME_BYTES = 220;

function normalize(value) {
    if(typeof value !== "string") return null;
    let basename = value
        .normalize("NFC")
        .replace(INVALID_FILENAME_CHARACTERS, "_")
        .split("")
        .map((character) => character.charCodeAt(0) < 32 ? "_" : character)
        .join("")
        .trim()
        .replace(/[. ]+$/g, "");
    if(basename.length === 0) return null;
    if(WINDOWS_RESERVED_NAME.test(basename)) basename = `_${basename}`;
    while(Buffer.byteLength(basename, "utf8") > MAX_BASENAME_BYTES) {
        basename = basename.slice(0, -1);
    }
    return basename.replace(/[. ]+$/g, "") || null;
}

function toOutputTemplate(value) {
    const basename = normalize(value);
    if(basename == null) return null;
    return `${basename.replace(/%/g, "%%")}.%(ext)s`;
}

module.exports = { normalize, toOutputTemplate };
