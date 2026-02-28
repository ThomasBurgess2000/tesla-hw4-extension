(function bootstrapTeslaHwBadge(globalScope) {
  if (globalScope.__teslaHwBadgeInitialized) {
    return;
  }

  globalScope.__teslaHwBadgeInitialized = true;

  const BADGE_CLASS = "tesla-hw-badge";
  const BADGE_HOST_ATTR = "data-tesla-hw-badge-host";
  const PAGE_BRIDGE_ID = "tesla-hw-badge-page-bridge";
  const PAGE_MESSAGE_TYPE = "tesla-hw-badge:inventory-results";
  const VIN_REGEX = /\b(?:5YJ|7SA|LRW|XP7)[A-HJ-NPR-Z0-9]{14}\b/;
  const YEAR_CODES = {
    E: 2014,
    F: 2015,
    G: 2016,
    H: 2017,
    J: 2018,
    K: 2019,
    L: 2020,
    M: 2021,
    N: 2022,
    P: 2023,
    R: 2024,
    S: 2025,
    T: 2026
  };
  const MODEL_RULES = {
    my: {
      label: "Model Y",
      plants: {
        A: {
          plantName: "Austin",
          transitionYearCode: "P",
          ambiguousStartSerial: 127000,
          ambiguousEndSerial: 131199,
          hw4StartSerial: 131200,
          source: "Crowdsourced Austin cutoff plus broader community transition band"
        },
        F: {
          plantName: "Fremont",
          transitionYearCode: "P",
          ambiguousStartSerial: 789500,
          ambiguousEndSerial: 800000,
          hw4StartSerial: 800001,
          source: "Crowdsourced Fremont cutoff plus broader community transition band"
        }
      }
    },
    ms: {
      label: "Model S",
      plants: {
        F: {
          plantName: "Fremont",
          transitionYearCode: "P",
          ambiguousStartSerial: 501000,
          ambiguousEndSerial: 502000,
          hw4StartSerial: 502001,
          source: "Community-reported early HW4 transition band"
        }
      }
    },
    mx: {
      label: "Model X",
      plants: {
        F: {
          plantName: "Fremont",
          transitionYearCode: "P",
          ambiguousStartSerial: 370000,
          ambiguousEndSerial: 380000,
          hw4StartSerial: 380001,
          source: "Community-reported mixed transition band"
        }
      }
    },
    m3: {
      label: "Model 3",
      source: "No stable VIN cutoff found across current community sources"
    }
  };
  const inventoryResultsByIndex = [];
  const requestedOffsets = new Set();
  let pageBridgeInstalled = false;

  const scan = debounce(scanForListings, 80);

  function debounce(callback, delayMs) {
    let timeoutId = null;

    return function debounced() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = globalScope.setTimeout(() => {
        timeoutId = null;
        callback();
      }, delayMs);
    };
  }

  function normalizeVin(value) {
    if (!value) {
      return null;
    }

    const match = String(value).toUpperCase().match(VIN_REGEX);
    return match ? match[0] : null;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseInventoryRequest(url) {
    try {
      const parsedUrl = new URL(url, globalScope.location.href);
      const queryParam = parsedUrl.searchParams.get("query");
      if (!queryParam) {
        return { offset: 0 };
      }

      const parsedQuery = JSON.parse(queryParam);
      return {
        offset: Number(parsedQuery.offset) || 0
      };
    } catch (error) {
      return { offset: 0 };
    }
  }

  function installPageBridge() {
    if (pageBridgeInstalled || document.getElementById(PAGE_BRIDGE_ID)) {
      return;
    }

    const script = document.createElement("script");
    script.id = PAGE_BRIDGE_ID;
    script.src = globalScope.chrome.runtime.getURL("page-bridge.js");
    script.dataset.messageType = PAGE_MESSAGE_TYPE;
    script.addEventListener("load", () => {
      script.remove();
    }, { once: true });

    const host = document.head || document.documentElement;
    if (!host) {
      globalScope.setTimeout(installPageBridge, 0);
      return;
    }

    pageBridgeInstalled = true;
    host.appendChild(script);
  }

  function recordInventoryResults(url, results) {
    const { offset } = parseInventoryRequest(url);
    const safeOffset = Math.max(0, offset);

    results.forEach((record, index) => {
      inventoryResultsByIndex[safeOffset + index] = record;
    });

    scan();
  }

  function getInventoryContext() {
    const match = globalScope.location.pathname.match(/^\/inventory\/(used|new)\/([^/?#]+)/i);
    if (!match) {
      return null;
    }

    return {
      condition: match[1].toLowerCase(),
      model: match[2].toLowerCase()
    };
  }

  async function requestInventoryResults(offset, count) {
    const context = getInventoryContext();
    if (!context) {
      return;
    }

    if (requestedOffsets.has(offset)) {
      return;
    }

    requestedOffsets.add(offset);

    try {
      const payload = {
        query: {
          model: context.model,
          condition: context.condition,
          arrangeby: "Price",
          order: "asc",
          market: "US",
          language: "en"
        },
        offset,
        count
      };
      const url = new URL("/inventory/api/v4/inventory-results", globalScope.location.origin);
      url.searchParams.set("query", JSON.stringify(payload));

      const response = await globalScope.fetch(url.toString(), {
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error(`Inventory request failed with ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data && data.results)) {
        recordInventoryResults(url.toString(), data.results);
      }
    } catch (error) {
      requestedOffsets.delete(offset);
    }
  }

  function ensureInventoryCoverage(cardCount) {
    if (cardCount === 0) {
      return;
    }

    const knownCount = inventoryResultsByIndex.length;
    if (knownCount >= cardCount) {
      return;
    }

    const missingCount = Math.max(1, cardCount - knownCount);
    void requestInventoryResults(knownCount, missingCount);
  }

  function extractVinFromNode(node) {
    const directVin = normalizeVin(node.textContent);
    if (directVin) {
      return directVin;
    }

    const selectors = [
      "[data-vin]",
      "a[href]",
      "[href]",
      "[title]",
      "[aria-label]"
    ];

    for (const selector of selectors) {
      const matches = node.matches && node.matches(selector) ? [node] : [];
      const descendants = Array.from(node.querySelectorAll ? node.querySelectorAll(selector) : []);
      const elements = matches.concat(descendants);

      for (const element of elements) {
        const values = [
          element.getAttribute && element.getAttribute("data-vin"),
          element.getAttribute && element.getAttribute("href"),
          element.getAttribute && element.getAttribute("title"),
          element.getAttribute && element.getAttribute("aria-label")
        ];

        for (const value of values) {
          const vin = normalizeVin(value);
          if (vin) {
            return vin;
          }
        }
      }
    }

    return null;
  }

  function parseYearCode(code) {
    return YEAR_CODES[code] || null;
  }

  function formatSerial(serialNumber) {
    return String(serialNumber).padStart(6, "0");
  }

  function resolveModelCode(record) {
    if (record && typeof record.Model === "string" && record.Model) {
      return record.Model.toLowerCase();
    }

    const context = getInventoryContext();
    return context ? context.model : null;
  }

  function buildModel3Classification(vehicleYear, normalizedVin) {
    if (!vehicleYear) {
      return {
        status: "HW3/HW4",
        detail: [
          "Model 3 cutoff is not stable in the current sources",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    if (vehicleYear <= 2018) {
      return {
        status: "HW2.5",
        detail: [
          "Model 3 vehicles through 2018 are treated as pre-HW3",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    if (vehicleYear === 2019) {
      return {
        status: "HW2.5/HW3",
        detail: [
          "Model 3 in 2019 spans the HW2.5 to HW3 transition",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    if (vehicleYear <= 2023) {
      return {
        status: "HW3",
        detail: [
          "U.S. Model 3 vehicles through 2023 are treated as pre-Highland",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    return {
      status: "HW4",
      detail: [
        "U.S. 2024+ Model 3 vehicles are treated as Highland-era",
        `VIN: ${normalizedVin}`
      ].join(" | ")
    };
  }

  function classifyVehicle(vin, record) {
    const normalizedVin = normalizeVin(vin);
    if (!normalizedVin) {
      return null;
    }

    const modelCode = resolveModelCode(record);
    const plantCode = normalizedVin[10];
    const vehicleYear = parseYearCode(normalizedVin[9]);
    const serialNumber = Number.parseInt(normalizedVin.slice(11), 10);

    if (Number.isNaN(serialNumber)) {
      return {
        status: "HW3/HW4",
        detail: "VIN format is not supported by the current thresholds"
      };
    }

    if (modelCode === "m3") {
      return buildModel3Classification(vehicleYear, normalizedVin);
    }

    if (vehicleYear && vehicleYear <= 2018) {
      return {
        status: "HW2.5",
        detail: [
          "Vehicles through 2018 are treated as pre-HW3",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    if (vehicleYear === 2019) {
      return {
        status: "HW2.5/HW3",
        detail: [
          "2019 spans the HW2.5 to HW3 transition",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    const modelRule = modelCode ? MODEL_RULES[modelCode] : null;
    const plantRule = modelRule && modelRule.plants ? modelRule.plants[plantCode] : null;

    if (!modelRule || !plantRule) {
      return {
        status: "HW3/HW4",
        detail: [
          "No stable model and plant cutoff is configured",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    const transitionYear = parseYearCode(plantRule.transitionYearCode);
    if (!vehicleYear || !transitionYear) {
      return {
        status: "HW3/HW4",
        detail: [
          "VIN year code is not supported by the current thresholds",
          `VIN: ${normalizedVin}`
        ].join(" | ")
      };
    }

    let status = "HW3";

    if (vehicleYear > transitionYear) {
      status = "HW4";
    } else if (vehicleYear === transitionYear) {
      if (serialNumber >= plantRule.hw4StartSerial) {
        status = "HW4";
      } else if (
        serialNumber >= plantRule.ambiguousStartSerial &&
        serialNumber <= plantRule.ambiguousEndSerial
      ) {
        status = "HW3/HW4";
      }
    }

    return {
      status,
      detail: [
        `${modelRule.label} ${plantRule.plantName} transition: ${plantRule.transitionYearCode}${plantCode}${formatSerial(plantRule.ambiguousStartSerial)}-${plantRule.transitionYearCode}${plantCode}${formatSerial(plantRule.ambiguousEndSerial)}`,
        `confirmed HW4 from: ${plantRule.transitionYearCode}${plantCode}${formatSerial(plantRule.hw4StartSerial)}`,
        `source: ${plantRule.source}`,
        `VIN: ${normalizedVin}`
      ].join(" | ")
    };
  }

  function getCardCandidates(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const resultsRoot = scope.querySelector(".results-container--grid, .results-container");
    const searchRoot = resultsRoot || scope;
    const candidates = new Set();
    const cardSelectors = [
      "article",
      "li",
      "[data-testid*='result']",
      "[data-testid*='vehicle']",
      "[class*='result']",
      "[class*='card']",
      "[class*='wrapper']"
    ];

    for (const selector of cardSelectors) {
      for (const element of searchRoot.querySelectorAll(selector)) {
        candidates.add(element);
      }
    }

    if (searchRoot !== document && candidates.size === 0) {
      for (const child of Array.from(searchRoot.children)) {
        candidates.add(child);
      }
    }

    for (const link of searchRoot.querySelectorAll("a[href*='/inventory/']")) {
      let current = link;
      while (current && current !== searchRoot && current !== document.body) {
        if (
          current.matches &&
          (
            current.matches("article") ||
            current.matches("li") ||
            (current.className && /(card|result|vehicle)/i.test(String(current.className)))
          )
        ) {
          candidates.add(current);
          break;
        }

        current = current.parentElement;
      }
    }

    const filtered = Array.from(candidates).filter((candidate) => {
      if (!candidate || !candidate.isConnected || !candidate.querySelectorAll) {
        return false;
      }

      const text = normalizeText(candidate.innerText || candidate.textContent);
      const hasListingText = /\$\s?\d/.test(text) && /(Located in|mi range|Pre-Owned Vehicle|New Vehicle)/i.test(text);
      const hasHeading = Boolean(candidate.querySelector("h1, h2, h3, h4")) || /(Model [S3XY]|Range|Drive)/i.test(text);
      const hasMedia = Boolean(candidate.querySelector("img, picture, canvas"));

      if (!hasListingText || !hasHeading || !hasMedia) {
        return false;
      }

      if (candidate.children.length > 20) {
        return false;
      }

      return true;
    });

    return filtered.filter((candidate) => {
      return !filtered.some((other) => other !== candidate && candidate.contains(other));
    });
  }

  function findBadgeAnchor(card) {
    const heading = card.querySelector("h1, h2, h3, h4, [role='heading']");
    if (heading) {
      return heading;
    }

    if (card.firstElementChild) {
      return card.firstElementChild;
    }

    return card;
  }

  function ensureBadgeHost(card) {
    if (card.getAttribute(BADGE_HOST_ATTR) === "true") {
      return;
    }

    card.setAttribute(BADGE_HOST_ATTR, "true");
    const style = globalScope.getComputedStyle(card);

    if (style.position === "static") {
      card.style.position = "relative";
    }
  }

  function createBadge(classification) {
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = classification.status;
    badge.title = classification.detail;

    const palette = classification.status === "HW4"
      ? {
          background: "#16a34a",
          color: "#ffffff"
        }
      : classification.status === "HW3"
        ? {
            background: "#1d4ed8",
            color: "#ffffff"
          }
        : {
            background: "#64748b",
            color: "#ffffff"
          };

    Object.assign(badge.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4px 8px",
      marginBottom: "8px",
      borderRadius: "999px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      fontWeight: "700",
      lineHeight: "1",
      letterSpacing: "0.02em",
      backgroundColor: palette.background,
      color: palette.color,
      boxShadow: "0 2px 6px rgba(15, 23, 42, 0.16)"
    });

    return badge;
  }

  function applyBadge(card, classification) {
    if (!card || !classification) {
      return;
    }

    const existingBadge = card.querySelector(`.${BADGE_CLASS}`);
    if (existingBadge) {
      existingBadge.textContent = classification.status;
      existingBadge.title = classification.detail;
      return;
    }

    ensureBadgeHost(card);
    const badge = createBadge(classification);
    const anchor = findBadgeAnchor(card);

    if (anchor === card) {
      card.prepend(badge);
      return;
    }

    anchor.insertAdjacentElement("beforebegin", badge);
  }

  function badgeCard(card, index) {
    if (!card) {
      return;
    }

    const directVin = extractVinFromNode(card);
    const indexedVin = normalizeVin(inventoryResultsByIndex[index] && inventoryResultsByIndex[index].VIN);
    const vin = directVin || indexedVin;
    if (!vin) {
      return;
    }

    const classification = classifyVehicle(vin, inventoryResultsByIndex[index]);
    if (!classification) {
      return;
    }

    applyBadge(card, classification);
  }

  function scanForListings() {
    const cards = getCardCandidates(document);
    cards.forEach((card, index) => {
      badgeCard(card, index);
    });
    ensureInventoryCoverage(cards.length);
  }

  function startObservers() {
    const observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });

    globalScope.addEventListener("scroll", scan, { passive: true });
    globalScope.addEventListener("resize", scan);
  }

  globalScope.TeslaHwBadge = {
    classifyVehicle,
    classifyVin: classifyVehicle,
    extractVinFromNode,
    recordInventoryResults,
    scanForListings
  };

  globalScope.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== PAGE_MESSAGE_TYPE || !Array.isArray(data.results)) {
      return;
    }

    recordInventoryResults(data.url, data.results);
  });

  installPageBridge();

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        scanForListings();
        startObservers();
      },
      { once: true }
    );
  } else {
    scanForListings();
    startObservers();
  }
})(window);
