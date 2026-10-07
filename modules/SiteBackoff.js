class SiteBackoff {
    constructor() {
        this.cooldowns = new Map();
    }

    async wait(rawUrl) {
        const key = this.getKey(rawUrl);
        const until = this.cooldowns.get(key);
        if (until == null) {
            return 0;
        }
        const waitMs = until - Date.now();
        if (waitMs <= 0) {
            this.cooldowns.delete(key);
            return 0;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, waitMs);
        });
        this.cooldowns.delete(key);
        return waitMs;
    }

    register(rawUrl, cooldownMs) {
        if (cooldownMs == null || cooldownMs <= 0) {
            return;
        }
        const key = this.getKey(rawUrl);
        const current = this.cooldowns.get(key) || 0;
        this.cooldowns.set(key, Math.max(current, Date.now() + cooldownMs));
    }

    clear(rawUrl) {
        this.cooldowns.delete(this.getKey(rawUrl));
    }

    getKey(rawUrl) {
        try {
            return new URL(rawUrl).hostname;
        } catch (error) {
            return rawUrl;
        }
    }
}

module.exports = SiteBackoff;
