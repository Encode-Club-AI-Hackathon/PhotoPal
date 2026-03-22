Page({
  data: {
    url: "",
    webviewLoading: true,
    webviewError: "",
  },
  onLoad: function (options) {
    const incoming = options && options.url ? decodeURIComponent(options.url) : "";
    this.setData({
      url: incoming,
      webviewLoading: !!incoming,
      webviewError: incoming ? "" : "Unable to load this website.",
    });
  },
  onWebviewLoad: function () {
    this.setData({ webviewLoading: false, webviewError: "" });
  },
  onWebviewError: function () {
    this.setData({ webviewLoading: false, webviewError: "This page could not be opened." });
  },
  retryLoad: function () {
    const currentUrl = this.data.url || "";
    if (!currentUrl) {
      return;
    }

    this.setData({
      webviewLoading: true,
      webviewError: "",
      url: "",
    });

    setTimeout(() => {
      this.setData({ url: currentUrl });
    }, 0);
  },
  goBack: function () {
    wx.navigateBack();
  },
});
