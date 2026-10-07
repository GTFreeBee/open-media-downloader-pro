jest.mock("electron", () => ({
  shell: {},
  dialog: {}
}));

jest.mock("../modules/info/InfoQueryList");
jest.mock("../modules/download/DownloadQueryList", () => {
  return jest.fn().mockImplementation(function() {
    this.cancel = jest.fn();
    this.start = jest.fn().mockResolvedValue();
    this.progressBar = {
      done: jest.fn()
    };
  });
});
jest.mock("../modules/DoneAction", () => {
  return jest.fn().mockImplementation(function() {
    this.executeAction = jest.fn();
  });
});

const QueryManager = require("../modules/QueryManager");
const InfoQueryList = require("../modules/info/InfoQueryList");

describe("QueryManager cancellation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not resurrect a cancelled playlist after metadata fetching finishes later", async () => {
    let resolveFetch;
    const cancelMock = jest.fn();
    InfoQueryList.mockImplementation(function(query, environment, progressBar) {
      this.progressBar = progressBar;
      this.cancel = cancelMock;
      this.start = jest.fn(() => new Promise((resolve) => {
        resolveFetch = resolve;
      }));
    });

    const manager = buildManager();
    const initialQuery = {
      title: "Playlist Title",
      webpage_url: "https://example.com/playlist",
      uploader: "Uploader",
      entries: [
        { url: "https://example.com/video-1" }
      ]
    };

    manager.managePlaylist(initialQuery, "https://example.com/playlist");
    const playlistVideo = manager.managedVideos[0];

    await manager.stopDownload(playlistVideo.identifier);

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(manager.managedVideos).toHaveLength(0);

    resolveFetch([
      {
        audioCodecs: [],
        formats: [],
        thumbnail: "thumb.png"
      }
    ]);
    await flushPromises();

    expect(manager.managedVideos).toHaveLength(0);
    expect(manager.window.webContents.send).not.toHaveBeenCalledWith("videoAction", expect.objectContaining({
      action: "setUnified"
    }));
  });

  it("cancels matching pending recovery actions when a queued item is removed", async () => {
    const manager = buildManager();
    manager.pendingRecoveryActions = [
      {
        id: "recovery-job",
        sourceUrls: ["https://example.com/playlist"]
      }
    ];

    manager.managePlaylist({
      title: "Playlist Title",
      webpage_url: "https://example.com/playlist",
      entries: [
        { url: "https://example.com/video-1" }
      ]
    }, "https://example.com/playlist");

    const playlistVideo = manager.managedVideos[0];
    await manager.stopDownload(playlistVideo.identifier);

    expect(manager.pendingRecoveryActions).toEqual([]);
    expect(manager.environment.downloadRecovery.cancel).toHaveBeenCalledWith("recovery-job");
  });

  it("stores the recovery action on a unified playlist parent so cancelling the card clears resume state", () => {
    const manager = buildManager();
    const playlist = {
      identifier: "playlist-card",
      url: "https://example.com/playlist",
      videos: [
        { identifier: "child-1", url: "https://example.com/video-1" }
      ],
      downloadSubs: false,
      audioQuality: null,
      setQuery: jest.fn(function(query) {
        this.query = query;
      })
    };

    jest.spyOn(manager, "getVideo").mockReturnValue(playlist);
    jest.spyOn(manager, "registerDownloadAction").mockReturnValue("action-123");
    jest.spyOn(manager, "getUnifiedVideos").mockImplementation(() => {});

    manager.downloadUnifiedPlaylist({
      identifier: playlist.identifier,
      type: "audio",
      format: "320k",
      encoding: "none",
      audioEncoding: "none"
    });

    expect(playlist.activeRecoveryActionId).toEqual("action-123");
  });

  it("stores the queue recovery action on unified playlist parents", () => {
    const manager = buildManager();
    const unifiedPlaylist = {
      identifier: "playlist-card",
      url: "https://example.com/playlist",
      videos: [
        { identifier: "child-1", url: "https://example.com/video-1" }
      ],
      downloadSubs: false,
      audioQuality: null,
      selectedEncoding: "none",
      selectedAudioEncoding: "none",
      setQuery: jest.fn(function(query) {
        this.query = query;
      })
    };

    jest.spyOn(manager, "getVideo").mockReturnValue(unifiedPlaylist);
    jest.spyOn(manager, "registerDownloadAction").mockReturnValue("queue-action");
    jest.spyOn(manager, "getUnifiedVideos").mockImplementation(() => {});

    manager.downloadAllVideos({
      videos: [
        {
          identifier: unifiedPlaylist.identifier,
          type: "audio",
          format: "320k",
          encoding: "none",
          audioEncoding: "none"
        }
      ]
    });

    expect(unifiedPlaylist.activeRecoveryActionId).toEqual("queue-action");
  });
});

function buildManager() {
  const window = {
    webContents: {
      send: jest.fn()
    }
  };
  const environment = {
    settings: {
      splitMode: 0,
      sizeMode: "click",
      downloadPath: "C:\\downloads"
    },
    paths: {
      validateDownloadPath: jest.fn().mockResolvedValue()
    },
    logger: {
      clear: jest.fn()
    },
    downloadRecovery: {
      cancel: jest.fn().mockResolvedValue(),
      getEntry: jest.fn(() => null)
    },
    mainDownloadSubs: false
  };
  return new QueryManager(window, environment);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
