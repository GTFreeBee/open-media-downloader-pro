jest.mock("../modules/download/DownloadQuery");
jest.mock("../modules/types/ProgressBar");
const DownloadQuery = require("../modules/download/DownloadQuery");
const ProgressBar = require("../modules/types/ProgressBar");
const DownloadQueryList = require("../modules/download/DownloadQueryList");

it("does not mark cancelled downloads as finished or save their metadata", async () => {
    const done = jest.fn();
    ProgressBar.mockImplementation(() => ({done}));
    DownloadQuery.mockImplementation(() => ({connect: async () => "killed", progressBar: {done}}));
    const video = {url: "https://example.com", webpage_url: "https://example.com", setQuery(query) {this.query = query;}};
    const manager = {saveInfo: jest.fn()};
    const list = new DownloadQueryList([video], [], {settings: {downloadJsonMetadata: true}}, manager, {updatePlaylist: jest.fn()});
    await list.start();
    expect(video.downloaded).not.toBe(true);
    expect(done).not.toHaveBeenCalled();
    expect(manager.saveInfo).not.toHaveBeenCalled();
});
