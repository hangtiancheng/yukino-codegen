/**
 * Visual edit overlay script.
 *
 * Injected into the iframe document at runtime. Runs as a plain IIFE (no
 * module system) so it must be fully self-contained. Imported by the parent
 * app as a raw string through Vite's `?raw` suffix.
 */

/**
 * @typedef {Object} Rect
 * @property {number} top
 * @property {number} left
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} ElementInfo
 * @property {string} tagName
 * @property {string} id
 * @property {string} className
 * @property {string} textContent
 * @property {string} selector
 * @property {string} pagePath
 * @property {Rect} rect
 */

/**
 * @typedef {{ type: "TOGGLE_EDIT_MODE", editMode: boolean }
 *   | { type: "CLEAR_SELECTION" }
 *   | { type: "CLEAR_ALL_EFFECTS" }} IncomingMessage
 */

(function () {
  /** @type {boolean} */
  let isEditMode = false;
  /** @type {HTMLElement | null} */
  let currentHoverElement = null;
  /** @type {HTMLElement | null} */
  let currentSelectedElement = null;
  /** @type {boolean} */
  let eventListenersAdded = false;

  /** @returns {void} */
  function injectStyles() {
    if (document.getElementById("edit-mode-styles")) return;
    const style = document.createElement("style");
    style.id = "edit-mode-styles";
    style.textContent = [
      ".edit-hover {",
      "  outline: 2px dashed #1890ff;",
      "  outline-offset: 2px;",
      "  cursor: crosshair;",
      "  transition: outline 0.2s ease;",
      "  position: relative;",
      "}",
      ".edit-hover::before {",
      "  content: '';",
      "  position: absolute;",
      "  top: -4px;",
      "  left: -4px;",
      "  right: -4px;",
      "  bottom: -4px;",
      "  background: rgba(24, 144, 255, 0.02);",
      "  pointer-events: none;",
      "  z-index: -1;",
      "}",
      ".edit-selected {",
      "  outline: 3px solid #52c41a;",
      "  outline-offset: 2px;",
      "  cursor: default;",
      "  position: relative;",
      "}",
      ".edit-selected::before {",
      "  content: '';",
      "  position: absolute;",
      "  top: -4px;",
      "  left: -4px;",
      "  right: -4px;",
      "  bottom: -4px;",
      "  background: rgba(82, 196, 26, 0.03);",
      "  pointer-events: none;",
      "  z-index: -1;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  /**
   * Build a CSS selector path from the element up to <body>.
   * @param {HTMLElement} element
   * @returns {string}
   */
  function generateSelector(element) {
    /** @type {string[]} */
    const path = [];
    /** @type {HTMLElement | null} */
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += "#" + current.id;
        path.unshift(selector);
        break;
      }

      if (typeof current.className === "string" && current.className) {
        const classes = current.className.split(" ").filter(function (c) {
          return c && !c.startsWith("edit-");
        });
        if (classes.length > 0) {
          selector += "." + classes.join(".");
        }
      }

      const siblings = Array.from(
        (current.parentElement && current.parentElement.children) || [],
      );
      const index = siblings.indexOf(current) + 1;
      selector += ":nth-child(" + String(index) + ")";
      path.unshift(selector);

      current = current.parentElement;
    }

    return path.join(" > ");
  }

  /**
   * Collect serialisable info about the given element.
   * @param {HTMLElement} element
   * @returns {ElementInfo}
   */
  function getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const pagePath = window.location.search + window.location.hash || "";

    return {
      tagName: element.tagName,
      id: element.id || "",
      className: typeof element.className === "string" ? element.className : "",
      textContent: (element.textContent || "").trim().substring(0, 100),
      selector: generateSelector(element),
      pagePath: pagePath,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  /** @returns {void} */
  function clearHoverEffect() {
    if (currentHoverElement) {
      currentHoverElement.classList.remove("edit-hover");
      currentHoverElement = null;
    }
  }

  /** @returns {void} */
  function clearSelectedEffect() {
    const selected = document.querySelectorAll(".edit-selected");
    for (let i = 0; i < selected.length; i++) {
      selected[i].classList.remove("edit-selected");
    }
    currentSelectedElement = null;
  }

  /** @returns {void} */
  function addEventListeners() {
    if (eventListenersAdded) return;

    document.body.addEventListener(
      "mouseover",
      /** @param {MouseEvent} event */
      function (event) {
        if (!isEditMode) return;
        const target = /** @type {HTMLElement} */ (event.target);
        if (target === currentHoverElement || target === currentSelectedElement)
          return;
        if (target === document.body || target === document.documentElement)
          return;
        if (target.tagName === "SCRIPT" || target.tagName === "STYLE") return;

        clearHoverEffect();
        target.classList.add("edit-hover");
        currentHoverElement = target;
      },
      true,
    );

    document.body.addEventListener(
      "mouseout",
      /** @param {MouseEvent} event */
      function (event) {
        if (!isEditMode) return;
        const target = /** @type {HTMLElement} */ (event.target);
        if (
          !event.relatedTarget ||
          !target.contains(/** @type {Node} */ (event.relatedTarget))
        ) {
          clearHoverEffect();
        }
      },
      true,
    );

    document.body.addEventListener(
      "click",
      /** @param {MouseEvent} event */
      function (event) {
        if (!isEditMode) return;
        event.preventDefault();
        event.stopPropagation();

        const target = /** @type {HTMLElement} */ (event.target);
        if (target === document.body || target === document.documentElement)
          return;
        if (target.tagName === "SCRIPT" || target.tagName === "STYLE") return;

        clearSelectedEffect();
        clearHoverEffect();

        target.classList.add("edit-selected");
        currentSelectedElement = target;

        const elementInfo = getElementInfo(target);
        try {
          window.parent.postMessage(
            { type: "ELEMENT_SELECTED", elementInfo: elementInfo },
            "*",
          );
        } catch (_e) {
          // Silently handle send failure.
        }
      },
      true,
    );

    eventListenersAdded = true;
  }

  /** @returns {void} */
  function showEditTip() {
    if (document.getElementById("edit-tip")) return;

    const tip = document.createElement("div");
    tip.id = "edit-tip";
    tip.textContent = "Edit mode active - hover to inspect, click to select";
    tip.style.cssText = [
      "position: fixed",
      "top: 20px",
      "right: 20px",
      "background: #1890ff",
      "color: white",
      "padding: 12px 16px",
      "border-radius: 6px",
      "font-size: 14px",
      "z-index: 9999",
      "box-shadow: 0 4px 12px rgba(0,0,0,0.15)",
      "animation: __editFadeIn 0.3s ease",
    ].join(";");

    const animStyle = document.createElement("style");
    animStyle.textContent =
      "@keyframes __editFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }";
    document.head.appendChild(animStyle);
    document.body.appendChild(tip);

    setTimeout(function () {
      if (tip.parentNode) {
        tip.style.opacity = "0";
        tip.style.transition = "opacity 0.3s ease";
        setTimeout(function () {
          if (tip.parentNode) tip.remove();
        }, 300);
      }
    }, 3000);
  }

  window.addEventListener(
    "message",
    /** @param {MessageEvent} event */
    function (event) {
      const msg = /** @type {IncomingMessage | undefined} */ (event.data);
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case "TOGGLE_EDIT_MODE":
          isEditMode = !!msg.editMode;
          if (isEditMode) {
            injectStyles();
            addEventListeners();
            showEditTip();
          } else {
            clearHoverEffect();
            clearSelectedEffect();
          }
          break;
        case "CLEAR_SELECTION":
          clearSelectedEffect();
          break;
        case "CLEAR_ALL_EFFECTS":
          isEditMode = false;
          clearHoverEffect();
          clearSelectedEffect();
          {
            const tip = document.getElementById("edit-tip");
            if (tip) tip.remove();
          }
          break;
      }
    },
  );

  /** @returns {void} */
  function initialize() {
    injectStyles();
    addEventListeners();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
