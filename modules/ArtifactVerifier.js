const crypto = require("crypto");
const fs = require("fs");

class ArtifactVerifier {
    static assertHttpsUrl(value, allowedHosts = []) {
        let parsed;
        try {
            parsed = new URL(value);
        } catch (error) {
            throw new Error("The update service returned an invalid download URL.");
        }

        if (parsed.protocol !== "https:") {
            throw new Error("Update downloads must use HTTPS.");
        }

        if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
            throw new Error(`Update download host is not trusted: ${parsed.hostname}`);
        }

        return parsed.toString();
    }

    static normalizeSha256(digest) {
        const normalized = String(digest || "")
            .trim()
            .toLowerCase()
            .replace(/^sha256:/, "");
        if (!/^[a-f0-9]{64}$/.test(normalized)) {
            throw new Error("The update service did not provide a valid SHA-256 digest.");
        }
        return normalized;
    }

    static async sha256(filePath) {
        return await new Promise((resolve, reject) => {
            const hash = crypto.createHash("sha256");
            const stream = fs.createReadStream(filePath);
            stream.on("error", reject);
            stream.on("data", (chunk) => hash.update(chunk));
            stream.on("end", () => resolve(hash.digest("hex")));
        });
    }

    static async verifySha256(filePath, expectedDigest) {
        const expected = ArtifactVerifier.normalizeSha256(expectedDigest);
        const actual = await ArtifactVerifier.sha256(filePath);
        if (actual !== expected) {
            await fs.promises.rm(filePath, { force: true });
            throw new Error(`Downloaded update failed integrity verification (expected ${expected}, received ${actual}).`);
        }
        return true;
    }
}

module.exports = ArtifactVerifier;
