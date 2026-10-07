const child_process = require('child_process'),
    fs = require('fs'),
    path = require('path');

const appName = "open-media-downloader-pro";

async function removeAppUpdateConfig(appOutDir) {
    const appUpdatePath = path.join(appOutDir, "resources", "app-update.yml");
    try {
        await fs.promises.rm(appUpdatePath, { force: true });
    } catch (error) {
        console.error(error);
    }
}

function isLinux(targets) {
    const re = /AppImage|snap|deb|rpm|freebsd|pacman/i;
    return !!targets.find(target => re.test(target.name));
}

async function afterPack({targets, appOutDir}) {
    await removeAppUpdateConfig(appOutDir);
    if (!isLinux(targets)) return;
    const script = '#!/bin/bash\n"${BASH_SOURCE%/*}"/' + appName + '.bin "$@" --no-sandbox --ozone-platform-hint=auto',
        scriptPath = path.join(appOutDir, appName);

    new Promise((resolve) => {
        const child = child_process.exec(`mv ${appName} ${appName}.bin`, {cwd: appOutDir});
        child.on('exit', () => {
            resolve();
        });
    }).then(() => {
        fs.writeFileSync(scriptPath, script);
        child_process.exec(`chmod +x ${appName}`, {cwd: appOutDir});
    });
}

module.exports = afterPack;
