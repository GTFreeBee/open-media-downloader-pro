const fs = require("fs");
const path = require("path");

describe("renderer security policy", () => {
    const rendererHtml = fs.readFileSync(path.join(__dirname, "../renderer/renderer.html"), "utf8");
    const rendererJs = fs.readFileSync(path.join(__dirname, "../renderer/renderer.js"), "utf8");
    const mainJs = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");

    it("does not permit inline scripts or inline event handlers", () => {
        expect(rendererHtml).not.toMatch(/script-src[^;]*unsafe-inline/i);
        expect(rendererHtml).not.toMatch(/\son[a-z]+\s*=/i);
    });

    it("does not pass remote metadata directly to jQuery html", () => {
        expect(rendererJs).not.toMatch(/\.html\(\s*(args|data|description|toastInfo)[.\[]/);
    });

    it("does not steal focus when the clipboard placeholder changes", () => {
        const handler = rendererJs.match(/window\.main\.receive\("updateLinkPlaceholder",[\s\S]*?\n\s*}\);/);
        expect(handler).not.toBeNull();
        expect(handler[0]).not.toContain(".focus(");
    });

    it("honours the saved startup lane sent by the main process", () => {
        expect(rendererJs).toContain('applyModeDefaults(getModeFromType(arg.type), {persist: false})');
    });

    it("uses a sandboxed renderer with context isolation", () => {
        expect(mainJs).toContain("nodeIntegration: false");
        expect(mainJs).toContain("contextIsolation: true");
        expect(mainJs).toContain("sandbox: true");
    });
});
