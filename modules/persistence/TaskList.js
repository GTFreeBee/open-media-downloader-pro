const fs = require('fs').promises

class TaskList {
    constructor(paths, manager) {
        this.paths = paths
        this.manager = manager
        this.data = null;
    }

    async save(excludedUrls = []) {
        const taskList = this.manager.getTaskList(excludedUrls);
        await fs.writeFile(this.paths.taskList, JSON.stringify(taskList))
    }

    async load(excludedUrls = []) {
        try {
            const res = await fs.readFile(this.paths.taskList)
            this.data = JSON.parse(res)
        } catch(err) {
            console.log("No tasks to restore.")
            return
        }
        this.data = this.data.filter((url) => !excludedUrls.includes(url));
        if(this.data.length > 0) {
            const toastInfo = {
                type: "task-list",
                title: "Queue restoration",
                body: `<p>Do you want to restore the ${this.data.length} ${this.data.length > 1 ? "items" : "item"}<br> you had in your queue?</p><button class="btn" data-dismiss="toast" id="tasklist-btn">Restore</button><button class="btn" data-dismiss="toast">Cancel</button>`
            }
            this.manager.window.webContents.send("toast", toastInfo)
        } else {
            console.log("No tasks to restore.")
        }
    }

    restore() {
        this.manager.loadTaskList(this.data)
    }
}

module.exports = TaskList
