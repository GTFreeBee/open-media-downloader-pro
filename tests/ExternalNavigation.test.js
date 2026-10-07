const { getSafeExternalUrl } = require("../modules/ExternalNavigation");

describe("getSafeExternalUrl", () => {
    it("allows ordinary HTTP and HTTPS links", () => {
        expect(getSafeExternalUrl("https://example.com/path")).toBe("https://example.com/path");
        expect(getSafeExternalUrl("http://example.com/path")).toBe("http://example.com/path");
    });

    it("rejects executable, local and credential-bearing URLs", () => {
        expect(getSafeExternalUrl("javascript:alert(1)")).toBeNull();
        expect(getSafeExternalUrl("file:///C:/secret.txt")).toBeNull();
        expect(getSafeExternalUrl("https://user:password@example.com/")).toBeNull();
    });
});
