(() => {
  if (window.__teslaHwBadgePageBridgeInstalled) {
    return;
  }

  window.__teslaHwBadgePageBridgeInstalled = true;

  const currentScript = document.currentScript;
  const messageType = currentScript && currentScript.dataset
    ? currentScript.dataset.messageType
    : "tesla-hw-badge:inventory-results";
  const inventoryPattern = /\/inventory\/api\/v4\/inventory-results/i;

  function parseOffset(url) {
    try {
      const parsedUrl = new URL(url, window.location.href);
      const queryParam = parsedUrl.searchParams.get("query");
      if (!queryParam) {
        return 0;
      }

      const parsedQuery = JSON.parse(queryParam);
      return Number(parsedQuery.offset) || 0;
    } catch (error) {
      return 0;
    }
  }

  function emit(url, payload) {
    if (!inventoryPattern.test(url)) {
      return;
    }

    const results = Array.isArray(payload && payload.results) ? payload.results : [];
    window.postMessage({
      source: messageType,
      url,
      offset: parseOffset(url),
      results
    }, "*");
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function wrappedFetch(...args) {
      const response = await originalFetch.apply(this, args);
      const requestUrl = response && response.url
        ? response.url
        : String(args[0] && args[0].url ? args[0].url : args[0] || "");

      if (inventoryPattern.test(requestUrl)) {
        response.clone().json().then(
          (payload) => emit(requestUrl, payload),
          () => {}
        );
      }

      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function wrappedOpen(method, url, ...rest) {
    this.__teslaHwBadgeRequestUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function wrappedSend(...args) {
    if (inventoryPattern.test(this.__teslaHwBadgeRequestUrl || "")) {
      this.addEventListener("load", () => {
        try {
          emit(this.responseURL || this.__teslaHwBadgeRequestUrl, JSON.parse(this.responseText));
        } catch (error) {}
      }, { once: true });
    }

    return originalSend.apply(this, args);
  };
})();
