const { URL } = require("url");

class DownloadRecoveryPolicy {
    static classify(errorText) {
        const message = (errorText || "").toString();
        const normalized = message.toLowerCase();
        const transientPatterns = [
            "timed out",
            "timeout",
            "temporarily unavailable",
            "connection reset",
            "connection aborted",
            "connection refused",
            "network is unreachable",
            "unable to download webpage",
            "unable to download video data",
            "unable to download api page",
            "unable to extract",
            "remote end closed connection",
            "download stalled",
            "i/o operation on closed file",
            "server returned 5",
            "http error 5"
        ];
        const authPatterns = [
            "sign in to confirm your age",
            "requested content is not available",
            "use --cookies",
            "this video is private",
            "login required",
            "members-only"
        ];
        const formatPatterns = [
            "requested format is not available",
            "requested format not available",
            "requested format is not available",
            "only images are available",
            "requested format not available",
            "no video formats found",
            "requested format not found"
        ];
        const filesystemPatterns = [
            "permission denied",
            "file is being used by another process",
            "access is denied",
            "the process cannot access the file",
            "device or resource busy"
        ];

        if (normalized.includes("429") || normalized.includes("too many requests") || normalized.includes("rate limit")) {
            return { kind: "rate-limit", retryable: true, fallbackEligible: false, cooldownMs: 15000 };
        }
        if (formatPatterns.some((pattern) => normalized.includes(pattern))) {
            return { kind: "format", retryable: false, fallbackEligible: true, cooldownMs: 0 };
        }
        if (authPatterns.some((pattern) => normalized.includes(pattern))) {
            return { kind: "auth", retryable: false, fallbackEligible: false, cooldownMs: 0 };
        }
        if (filesystemPatterns.some((pattern) => normalized.includes(pattern))) {
            return { kind: "filesystem", retryable: true, fallbackEligible: false, cooldownMs: 5000 };
        }
        if (transientPatterns.some((pattern) => normalized.includes(pattern))) {
            return { kind: "transient", retryable: true, fallbackEligible: true, cooldownMs: 5000 };
        }
        if (normalized.includes("error")) {
            return { kind: "fatal", retryable: false, fallbackEligible: false, cooldownMs: 0 };
        }
        return { kind: "unknown", retryable: true, fallbackEligible: false, cooldownMs: 4000 };
    }

    static getRetryDelay(classification, attempt) {
        const baseDelay = classification.kind === "rate-limit" ? 8000 : 2500;
        const maxDelay = classification.kind === "rate-limit" ? 30000 : 12000;
        return Math.min(baseDelay * attempt, maxDelay);
    }

    static shouldRetry(classification, attempt, maxAttempts) {
        return classification.retryable && attempt < maxAttempts;
    }

    static shouldFallback(video, classification, attemptedFallbacks = new Set()) {
        if (!classification.fallbackEligible) {
            return false;
        }
        if (video == null || video.audioOnly || video.videoOnly || video.formats == null || video.formats.length < 2) {
            return false;
        }
        return this.getFallbackFormatIndex(video, attemptedFallbacks) != null;
    }

    static getFallbackFormatIndex(video, attemptedFallbacks = new Set()) {
        if (video.formats == null || video.formats.length < 2) {
            return null;
        }
        const currentIndex = video.selected_format_index == null ? 0 : video.selected_format_index;
        for (let index = currentIndex + 1; index < video.formats.length; index++) {
            if (!attemptedFallbacks.has(index)) {
                return index;
            }
        }
        return null;
    }

    static getSiteKey(rawUrl) {
        try {
            return new URL(rawUrl).hostname;
        } catch (error) {
            return rawUrl;
        }
    }
}

module.exports = DownloadRecoveryPolicy;
