const fs = require("fs");
const os = require("os");
const path = require("path");
const ArtifactVerifier = require("../modules/ArtifactVerifier");

describe("ArtifactVerifier", () => {
    it("allows HTTPS only from an allowlisted host", () => {
        expect(ArtifactVerifier.assertHttpsUrl("https://github.com/tool", ["github.com"]))
            .toBe("https://github.com/tool");
        expect(() => ArtifactVerifier.assertHttpsUrl("http://github.com/tool", ["github.com"]))
            .toThrow("HTTPS");
        expect(() => ArtifactVerifier.assertHttpsUrl("https://example.com/tool", ["github.com"]))
            .toThrow("not trusted");
    });

    it("accepts a matching SHA-256 and deletes a mismatched artifact", async () => {
        const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "omdp-integrity-"));
        const file = path.join(tempDirectory, "artifact.bin");
        await fs.promises.writeFile(file, "trusted artifact");
        const digest = await ArtifactVerifier.sha256(file);

        await expect(ArtifactVerifier.verifySha256(file, digest)).resolves.toBe(true);
        await expect(ArtifactVerifier.verifySha256(file, "0".repeat(64))).rejects.toThrow("integrity verification");
        await expect(fs.promises.access(file)).rejects.toBeDefined();
        await fs.promises.rm(tempDirectory, {recursive: true, force: true});
    });
});
