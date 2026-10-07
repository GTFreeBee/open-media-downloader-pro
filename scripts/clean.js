const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

for (const directory of ["coverage", "dist"]) {
    const target = path.resolve(projectRoot, directory);
    if (path.dirname(target) !== projectRoot) {
        throw new Error(`Refusing to clean unexpected path: ${target}`);
    }
    fs.rmSync(target, { recursive: true, force: true });
}
