function getSafeExternalUrl(value) {
    try {
        const url = new URL(String(value));
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
            return null;
        }
        return url.toString();
    } catch (error) {
        return null;
    }
}

module.exports = { getSafeExternalUrl };
