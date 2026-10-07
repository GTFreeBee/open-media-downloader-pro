const DownloadRecoveryPolicy = require("../modules/download/DownloadRecoveryPolicy");

describe("DownloadRecoveryPolicy", () => {
    it("classifies rate limit responses as retryable", () => {
        const result = DownloadRecoveryPolicy.classify("ERROR: HTTP Error 429: Too Many Requests");
        expect(result.kind).toEqual("rate-limit");
        expect(result.retryable).toEqual(true);
        expect(result.cooldownMs).toBeGreaterThan(0);
    });

    it("classifies format errors as fallback eligible", () => {
        const result = DownloadRecoveryPolicy.classify("ERROR: Requested format is not available");
        expect(result.kind).toEqual("format");
        expect(result.fallbackEligible).toEqual(true);
        expect(result.retryable).toEqual(false);
    });

    it("selects the next lower format as fallback", () => {
        const video = {
            audioOnly: false,
            videoOnly: false,
            selected_format_index: 0,
            formats: [{ height: 1080 }, { height: 720 }, { height: 480 }]
        };
        const attemptedFallbacks = new Set([1]);
        const fallbackIndex = DownloadRecoveryPolicy.getFallbackFormatIndex(video, attemptedFallbacks);
        expect(fallbackIndex).toEqual(2);
    });
});
