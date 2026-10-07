const FilenameOverride = require("../modules/FilenameOverride");

describe("filename overrides", () => {
    it("keeps ordinary Unicode basenames", () => {
        expect(FilenameOverride.normalize("  My café 😀  ")).toBe("My café 😀");
    });

    it("replaces unsafe path characters and trailing dots", () => {
        expect(FilenameOverride.normalize('A/B:C*D?.  ')).toBe("A_B_C_D_");
    });

    it("protects Windows reserved names", () => {
        expect(FilenameOverride.normalize("CON.notes")).toBe("_CON.notes");
    });

    it("treats an empty basename as no override", () => {
        expect(FilenameOverride.normalize(" ... ")).toBeNull();
    });

    it("escapes downloader template markers and adds the dynamic extension", () => {
        expect(FilenameOverride.toOutputTemplate("100% complete")).toBe("100%% complete.%(ext)s");
    });

    it("limits the basename to a safe UTF-8 byte length", () => {
        const result = FilenameOverride.normalize("😀".repeat(100));
        expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(220);
    });
});
