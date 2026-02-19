// node_modules/electrobun/dist/api/shared/rpc.ts
var MAX_ID = 10000000000;
var DEFAULT_MAX_REQUEST_TIME = 1000;
function missingTransportMethodError(methods, action) {
  const methodsString = methods.map((m) => `"${m}"`).join(", ");
  return new Error(`This RPC instance cannot ${action} because the transport did not provide one or more of these methods: ${methodsString}`);
}
function createRPC(options = {}) {
  let debugHooks = {};
  let transport = {};
  let requestHandler = undefined;
  function setTransport(newTransport) {
    if (transport.unregisterHandler)
      transport.unregisterHandler();
    transport = newTransport;
    transport.registerHandler?.(handler);
  }
  function setRequestHandler(h) {
    if (typeof h === "function") {
      requestHandler = h;
      return;
    }
    requestHandler = (method, params) => {
      const handlerFn = h[method];
      if (handlerFn)
        return handlerFn(params);
      const fallbackHandler = h._;
      if (!fallbackHandler)
        throw new Error(`The requested method has no handler: ${String(method)}`);
      return fallbackHandler(method, params);
    };
  }
  const { maxRequestTime = DEFAULT_MAX_REQUEST_TIME } = options;
  if (options.transport)
    setTransport(options.transport);
  if (options.requestHandler)
    setRequestHandler(options.requestHandler);
  if (options._debugHooks)
    debugHooks = options._debugHooks;
  let lastRequestId = 0;
  function getRequestId() {
    if (lastRequestId <= MAX_ID)
      return ++lastRequestId;
    return lastRequestId = 0;
  }
  const requestListeners = new Map;
  const requestTimeouts = new Map;
  function requestFn(method, ...args) {
    const params = args[0];
    return new Promise((resolve, reject) => {
      if (!transport.send)
        throw missingTransportMethodError(["send"], "make requests");
      const requestId = getRequestId();
      const request2 = {
        type: "request",
        id: requestId,
        method,
        params
      };
      requestListeners.set(requestId, { resolve, reject });
      if (maxRequestTime !== Infinity)
        requestTimeouts.set(requestId, setTimeout(() => {
          requestTimeouts.delete(requestId);
          reject(new Error("RPC request timed out."));
        }, maxRequestTime));
      debugHooks.onSend?.(request2);
      transport.send(request2);
    });
  }
  const request = new Proxy(requestFn, {
    get: (target, prop, receiver) => {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      return (params) => requestFn(prop, params);
    }
  });
  const requestProxy = request;
  function sendFn(message, ...args) {
    const payload = args[0];
    if (!transport.send)
      throw missingTransportMethodError(["send"], "send messages");
    const rpcMessage = {
      type: "message",
      id: message,
      payload
    };
    debugHooks.onSend?.(rpcMessage);
    transport.send(rpcMessage);
  }
  const send = new Proxy(sendFn, {
    get: (target, prop, receiver) => {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      return (payload) => sendFn(prop, payload);
    }
  });
  const sendProxy = send;
  const messageListeners = new Map;
  const wildcardMessageListeners = new Set;
  function addMessageListener(message, listener) {
    if (!transport.registerHandler)
      throw missingTransportMethodError(["registerHandler"], "register message listeners");
    if (message === "*") {
      wildcardMessageListeners.add(listener);
      return;
    }
    if (!messageListeners.has(message))
      messageListeners.set(message, new Set);
    messageListeners.get(message).add(listener);
  }
  function removeMessageListener(message, listener) {
    if (message === "*") {
      wildcardMessageListeners.delete(listener);
      return;
    }
    messageListeners.get(message)?.delete(listener);
    if (messageListeners.get(message)?.size === 0)
      messageListeners.delete(message);
  }
  async function handler(message) {
    debugHooks.onReceive?.(message);
    if (!("type" in message))
      throw new Error("Message does not contain a type.");
    if (message.type === "request") {
      if (!transport.send || !requestHandler)
        throw missingTransportMethodError(["send", "requestHandler"], "handle requests");
      const { id, method, params } = message;
      let response;
      try {
        response = {
          type: "response",
          id,
          success: true,
          payload: await requestHandler(method, params)
        };
      } catch (error) {
        if (!(error instanceof Error))
          throw error;
        response = {
          type: "response",
          id,
          success: false,
          error: error.message
        };
      }
      debugHooks.onSend?.(response);
      transport.send(response);
      return;
    }
    if (message.type === "response") {
      const timeout = requestTimeouts.get(message.id);
      if (timeout != null)
        clearTimeout(timeout);
      const { resolve, reject } = requestListeners.get(message.id) ?? {};
      if (!message.success)
        reject?.(new Error(message.error));
      else
        resolve?.(message.payload);
      return;
    }
    if (message.type === "message") {
      for (const listener of wildcardMessageListeners)
        listener(message.id, message.payload);
      const listeners = messageListeners.get(message.id);
      if (!listeners)
        return;
      for (const listener of listeners)
        listener(message.payload);
      return;
    }
    throw new Error(`Unexpected RPC message type: ${message.type}`);
  }
  const proxy = { send: sendProxy, request: requestProxy };
  return {
    setTransport,
    setRequestHandler,
    request,
    requestProxy,
    send,
    sendProxy,
    addMessageListener,
    removeMessageListener,
    proxy
  };
}
function defineElectrobunRPC(_side, config) {
  const rpcOptions = {
    maxRequestTime: config.maxRequestTime,
    requestHandler: {
      ...config.handlers.requests,
      ...config.extraRequestHandlers
    },
    transport: {
      registerHandler: () => {}
    }
  };
  const rpc = createRPC(rpcOptions);
  const messageHandlers = config.handlers.messages;
  if (messageHandlers) {
    rpc.addMessageListener("*", (messageName, payload) => {
      const globalHandler = messageHandlers["*"];
      if (globalHandler) {
        globalHandler(messageName, payload);
      }
      const messageHandler = messageHandlers[messageName];
      if (messageHandler) {
        messageHandler(payload);
      }
    });
  }
  return rpc;
}

// node_modules/electrobun/dist/api/browser/index.ts
var WEBVIEW_ID = window.__electrobunWebviewId;
var RPC_SOCKET_PORT = window.__electrobunRpcSocketPort;

class Electroview {
  bunSocket;
  rpc;
  rpcHandler;
  constructor(config) {
    this.rpc = config.rpc;
    this.init();
  }
  init() {
    this.initSocketToBun();
    window.__electrobun.receiveMessageFromBun = this.receiveMessageFromBun.bind(this);
    if (this.rpc) {
      this.rpc.setTransport(this.createTransport());
    }
  }
  initSocketToBun() {
    const socket = new WebSocket(`ws://localhost:${RPC_SOCKET_PORT}/socket?webviewId=${WEBVIEW_ID}`);
    this.bunSocket = socket;
    socket.addEventListener("open", () => {});
    socket.addEventListener("message", async (event) => {
      const message = event.data;
      if (typeof message === "string") {
        try {
          const encryptedPacket = JSON.parse(message);
          const decrypted = await window.__electrobun_decrypt(encryptedPacket.encryptedData, encryptedPacket.iv, encryptedPacket.tag);
          this.rpcHandler?.(JSON.parse(decrypted));
        } catch (err) {
          console.error("Error parsing bun message:", err);
        }
      } else if (message instanceof Blob) {} else {
        console.error("UNKNOWN DATA TYPE RECEIVED:", event.data);
      }
    });
    socket.addEventListener("error", (event) => {
      console.error("Socket error:", event);
    });
    socket.addEventListener("close", (_event) => {});
  }
  createTransport() {
    const that = this;
    return {
      send(message) {
        try {
          const messageString = JSON.stringify(message);
          that.bunBridge(messageString);
        } catch (error) {
          console.error("bun: failed to serialize message to webview", error);
        }
      },
      registerHandler(handler) {
        that.rpcHandler = handler;
      }
    };
  }
  async bunBridge(msg) {
    if (this.bunSocket?.readyState === WebSocket.OPEN) {
      try {
        const { encryptedData, iv, tag } = await window.__electrobun_encrypt(msg);
        const encryptedPacket = {
          encryptedData,
          iv,
          tag
        };
        const encryptedPacketString = JSON.stringify(encryptedPacket);
        this.bunSocket.send(encryptedPacketString);
        return;
      } catch (error) {
        console.error("Error sending message to bun via socket:", error);
      }
    }
    window.__electrobunBunBridge?.postMessage(msg);
  }
  receiveMessageFromBun(msg) {
    if (this.rpcHandler) {
      this.rpcHandler(msg);
    }
  }
  static defineRPC(config) {
    return defineElectrobunRPC("webview", {
      ...config,
      extraRequestHandlers: {
        evaluateJavascriptWithResponse: ({ script }) => {
          return new Promise((resolve) => {
            try {
              const resultFunction = new Function(script);
              const result = resultFunction();
              if (result instanceof Promise) {
                result.then((resolvedResult) => {
                  resolve(resolvedResult);
                }).catch((error) => {
                  console.error("bun: async script execution failed", error);
                  resolve(String(error));
                });
              } else {
                resolve(result);
              }
            } catch (error) {
              console.error("bun: failed to eval script", error);
              resolve(String(error));
            }
          });
        }
      }
    });
  }
}
var Electrobun = {
  Electroview
};
var browser_default = Electrobun;

// src/mainview/lib/state.ts
class Store {
  #state;
  #listeners = new Set;
  constructor(initial) {
    this.#state = initial;
  }
  get() {
    return this.#state;
  }
  set(next) {
    this.#state = next;
    for (const fn of this.#listeners) {
      fn(next);
    }
  }
  update(fn) {
    this.set(fn(this.#state));
  }
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
}

// src/mainview/lib/dom.ts
function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (key === "class" || key === "className") {
        el.className = val;
      } else if (key === "style" && typeof val === "object") {
        Object.assign(el.style, val);
      } else if (key.startsWith("on") && typeof val === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === "dataset" && typeof val === "object") {
        for (const [dk, dv] of Object.entries(val)) {
          el.dataset[dk] = String(dv);
        }
      } else if (key === "hidden") {
        el.hidden = Boolean(val);
      } else if (key === "innerHTML") {
        el.innerHTML = val;
      } else {
        el.setAttribute(key, String(val));
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else if (child) {
        el.appendChild(child);
      }
    }
  }
  return el;
}
function qs(selector, parent = document) {
  return parent.querySelector(selector);
}
function clearChildren(el) {
  while (el.firstChild)
    el.removeChild(el.firstChild);
}

// src/mainview/components/panel-layout.ts
class PanelLayout {
  #el;
  #panels = new Map;
  #handles = [];
  #dragging = null;
  constructor(container, configs) {
    this.#el = h("div", { class: "panel-layout" });
    for (let i = 0;i < configs.length; i++) {
      const cfg = configs[i];
      const panel = h("div", {
        class: `panel panel-${cfg.id}`,
        dataset: { panelId: cfg.id }
      });
      if (cfg.hidden) {
        panel.style.width = "0px";
        panel.style.minWidth = "0px";
        panel.classList.add("panel-hidden");
      } else {
        panel.style.width = cfg.defaultWidth + "%";
        panel.style.minWidth = cfg.minWidth + "px";
      }
      this.#panels.set(cfg.id, {
        el: panel,
        config: cfg,
        hidden: cfg.hidden ?? false,
        currentWidth: cfg.hidden ? 0 : cfg.defaultWidth
      });
      this.#el.appendChild(panel);
      if (i < configs.length - 1) {
        const handle = h("div", {
          class: "panel-handle",
          dataset: { handleIndex: String(i) }
        });
        this.#el.appendChild(handle);
        this.#handles.push(handle);
        handle.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.#startDrag(i, e.clientX, configs[i].id, configs[i + 1].id);
        });
      }
    }
    document.addEventListener("mousemove", (e) => this.#onDrag(e));
    document.addEventListener("mouseup", () => this.#endDrag());
    container.appendChild(this.#el);
  }
  getPanel(id) {
    return this.#panels.get(id)?.el ?? null;
  }
  showPanel(id) {
    const state = this.#panels.get(id);
    if (!state || !state.hidden)
      return;
    state.hidden = false;
    state.el.classList.remove("panel-hidden");
    state.el.style.width = state.config.defaultWidth + "%";
    state.el.style.minWidth = state.config.minWidth + "px";
    this.#rebalance();
  }
  hidePanel(id) {
    const state = this.#panels.get(id);
    if (!state || state.hidden)
      return;
    state.hidden = true;
    state.el.classList.add("panel-hidden");
    state.el.style.width = "0px";
    state.el.style.minWidth = "0px";
    this.#rebalance();
  }
  togglePanel(id) {
    const state = this.#panels.get(id);
    if (!state)
      return;
    if (state.hidden)
      this.showPanel(id);
    else
      this.hidePanel(id);
  }
  isPanelVisible(id) {
    return !(this.#panels.get(id)?.hidden ?? true);
  }
  #startDrag(handleIndex, startX, leftId, rightId) {
    const leftPanel = this.#panels.get(leftId);
    const rightPanel = this.#panels.get(rightId);
    if (leftPanel.hidden || rightPanel.hidden)
      return;
    this.#dragging = {
      handleIndex,
      startX,
      leftId,
      rightId,
      leftStart: leftPanel.el.offsetWidth,
      rightStart: rightPanel.el.offsetWidth
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    this.#el.classList.add("dragging");
  }
  #onDrag(e) {
    if (!this.#dragging)
      return;
    const delta = e.clientX - this.#dragging.startX;
    const leftPanel = this.#panels.get(this.#dragging.leftId);
    const rightPanel = this.#panels.get(this.#dragging.rightId);
    let newLeftWidth = this.#dragging.leftStart + delta;
    let newRightWidth = this.#dragging.rightStart - delta;
    if (newLeftWidth < leftPanel.config.minWidth) {
      newLeftWidth = leftPanel.config.minWidth;
      newRightWidth = this.#dragging.leftStart + this.#dragging.rightStart - newLeftWidth;
    }
    if (newRightWidth < rightPanel.config.minWidth) {
      newRightWidth = rightPanel.config.minWidth;
      newLeftWidth = this.#dragging.leftStart + this.#dragging.rightStart - newRightWidth;
    }
    leftPanel.el.style.width = newLeftWidth + "px";
    rightPanel.el.style.width = newRightWidth + "px";
    leftPanel.el.style.flex = "none";
    rightPanel.el.style.flex = "none";
  }
  #endDrag() {
    if (!this.#dragging)
      return;
    this.#dragging = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    this.#el.classList.remove("dragging");
  }
  #rebalance() {
    for (const [_, state] of this.#panels) {
      if (!state.hidden) {
        state.el.style.flex = "";
      }
    }
  }
  get element() {
    return this.#el;
  }
}

// src/mainview/components/sidebar.ts
var ACTIVITY_DOTS = {
  working: { char: "●", cls: "dot-working" },
  waiting: { char: "◐", cls: "dot-waiting" },
  waiting_for_input: { char: "◐", cls: "dot-waiting-input" },
  idle: { char: "○", cls: "dot-idle" },
  finished: { char: "○", cls: "dot-finished" }
};

class Sidebar {
  #el;
  #listEl;
  #callbacks;
  #activeSessionId = null;
  #openMenuSessionId = null;
  #renamingSessionId = null;
  constructor(container, callbacks) {
    this.#callbacks = callbacks;
    const header = h("div", { class: "ws-header" }, [
      h("span", { class: "ws-header-title" }, ["Workspaces"]),
      h("button", {
        class: "ws-add-btn",
        onclick: () => callbacks.onAddWorkspace(),
        title: "Add workspace"
      }, ["+"])
    ]);
    this.#listEl = h("div", { class: "ws-list" });
    this.#el = h("div", { class: "sidebar" }, [
      header,
      this.#listEl
    ]);
    container.appendChild(this.#el);
  }
  setActiveSession(sessionId) {
    this.#activeSessionId = sessionId;
    for (const item of this.#el.querySelectorAll(".ws-session-item")) {
      item.classList.toggle("active", item.dataset.sessionId === sessionId);
    }
  }
  render(workspaces) {
    if (this.#renamingSessionId || this.#openMenuSessionId)
      return;
    clearChildren(this.#listEl);
    if (workspaces.length === 0) {
      this.#listEl.appendChild(h("div", { class: "ws-empty" }, [
        h("div", { class: "ws-empty-text" }, ["No workspaces"]),
        h("button", {
          class: "ws-empty-btn",
          onclick: () => this.#callbacks.onAddWorkspace()
        }, ["Open Workspace"])
      ]));
      return;
    }
    for (const ws of workspaces) {
      this.#listEl.appendChild(this.#renderWorkspace(ws));
    }
  }
  #renderWorkspace(ws) {
    const chevron = ws.expanded ? "▼" : "▶";
    const sessionCount = ws.sessions.length;
    const activeCount = ws.sessions.filter((s) => s.activity === "working" || s.activity === "waiting_for_input").length;
    const folderHeader = h("div", {
      class: "ws-folder-header",
      onclick: () => this.#callbacks.onToggleWorkspace(ws.path)
    }, [
      h("span", { class: "ws-chevron" }, [chevron]),
      h("span", { class: "ws-folder-name" }, [ws.name]),
      activeCount > 0 ? h("span", { class: "ws-active-badge" }, [String(activeCount)]) : h("span", { class: "ws-count" }, [String(sessionCount)])
    ]);
    const actions = h("div", { class: "ws-folder-actions" }, [
      h("button", {
        class: "ws-action-btn",
        onclick: (e) => {
          e.stopPropagation();
          this.#callbacks.onNewSession(ws.path);
        },
        title: "New session"
      }, ["+"]),
      h("button", {
        class: "ws-action-btn ws-action-remove",
        onclick: (e) => {
          e.stopPropagation();
          this.#callbacks.onRemoveWorkspace(ws.path);
        },
        title: "Remove workspace"
      }, ["×"])
    ]);
    const headerRow = h("div", { class: "ws-folder-row" }, [
      folderHeader,
      actions
    ]);
    const folder = h("div", {
      class: `ws-folder${ws.expanded ? " expanded" : ""}`,
      dataset: { wsPath: ws.path }
    }, [headerRow]);
    if (ws.expanded) {
      const sessionsList = h("div", { class: "ws-sessions" });
      if (ws.sessions.length === 0) {
        sessionsList.appendChild(h("div", { class: "ws-no-sessions" }, ["No sessions"]));
      } else {
        for (const session of ws.sessions) {
          sessionsList.appendChild(this.#renderSession(session, ws.path));
        }
      }
      folder.appendChild(sessionsList);
    }
    return folder;
  }
  #renderSession(session, workspacePath) {
    const dot = ACTIVITY_DOTS[session.activity] ?? ACTIVITY_DOTS.idle;
    const label = session.topic ?? session.prompt?.slice(0, 40) ?? "Claude session";
    const isActive = session.sessionId === this.#activeSessionId;
    const isHistorical = session.activity === "finished" && !session.isAppSpawned;
    const subtitle = isHistorical ? timeAgo(session.updatedAt || session.startedAt) : session.activity.replace(/_/g, " ");
    const sessionItem = h("div", {
      class: `ws-session-item${isActive ? " active" : ""}${isHistorical ? " historical" : ""}`,
      dataset: { sessionId: session.sessionId },
      onclick: (e) => {
        if (e.target.closest(".ws-session-menu-btn, .ws-session-menu")) {
          return;
        }
        this.#callbacks.onSelectSession(session.sessionId, workspacePath);
      }
    }, [
      h("span", { class: `ws-session-dot ${dot.cls}` }, [dot.char]),
      h("div", { class: "ws-session-info" }, [
        h("span", { class: "ws-session-label" }, [label]),
        h("span", { class: "ws-session-activity" }, [subtitle])
      ]),
      h("button", {
        class: "ws-session-menu-btn",
        onclick: (e) => {
          e.stopPropagation();
          this.#toggleSessionMenu(session.sessionId, sessionItem);
        },
        title: "Session options"
      }, ["⋮"])
    ]);
    return sessionItem;
  }
  #toggleSessionMenu(sessionId, sessionItem) {
    const existingMenu = this.#el.querySelector(".ws-session-menu");
    if (existingMenu) {
      existingMenu.remove();
      if (this.#openMenuSessionId === sessionId) {
        this.#openMenuSessionId = null;
        return;
      }
    }
    this.#openMenuSessionId = sessionId;
    const menu = h("div", { class: "ws-session-menu" }, [
      h("button", {
        class: "ws-session-menu-item",
        onclick: () => {
          this.#showRenameDialog(sessionId);
          menu.remove();
          this.#openMenuSessionId = null;
        }
      }, ["Rename"])
    ]);
    sessionItem.appendChild(menu);
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        this.#openMenuSessionId = null;
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }
  #showRenameDialog(sessionId) {
    const sessionEl = this.#el.querySelector(`[data-session-id="${sessionId}"]`);
    if (!sessionEl)
      return;
    const labelEl = sessionEl.querySelector(".ws-session-label");
    if (!labelEl)
      return;
    const currentName = labelEl.textContent ?? "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ws-session-rename-input";
    input.value = currentName;
    input.placeholder = "Session name";
    this.#renamingSessionId = sessionId;
    const save = () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        this.#callbacks.onRenameSession(sessionId, newName);
        labelEl.textContent = newName;
      } else {
        labelEl.textContent = currentName;
      }
      labelEl.style.display = "";
      input.remove();
      this.#renamingSessionId = null;
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        save();
      } else if (e.key === "Escape") {
        labelEl.textContent = currentName;
        labelEl.style.display = "";
        input.remove();
        this.#renamingSessionId = null;
      }
    });
    labelEl.style.display = "none";
    labelEl.parentElement?.insertBefore(input, labelEl);
    input.focus();
    input.select();
  }
  get element() {
    return this.#el;
  }
}
function timeAgo(dateStr) {
  if (!dateStr)
    return "finished";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)
    return "just now";
  if (mins < 60)
    return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)
    return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// src/mainview/components/chat-view.ts
class ChatView {
  #el;
  #messagesEl;
  #inputEl;
  #sendBtn;
  #stopBtn;
  #statusEl;
  #permDetailsEl;
  #permLabelEl;
  #permDefaultBtn;
  #permFullBtn;
  #fullAccess = true;
  #callbacks;
  #isWaiting = false;
  constructor(container, callbacks) {
    this.#callbacks = callbacks;
    this.#messagesEl = h("div", { class: "chat-messages" });
    this.#statusEl = h("div", { class: "chat-status", hidden: true });
    this.#inputEl = document.createElement("textarea");
    this.#inputEl.className = "chat-input";
    this.#inputEl.placeholder = "Ask Claude something...";
    this.#inputEl.rows = 1;
    this.#inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.#send();
      }
    });
    this.#inputEl.addEventListener("input", () => {
      this.#inputEl.style.height = "auto";
      this.#inputEl.style.height = Math.min(this.#inputEl.scrollHeight, 150) + "px";
    });
    this.#sendBtn = h("button", { class: "chat-send-btn", onclick: () => this.#send() }, ["Send"]);
    this.#stopBtn = h("button", { class: "chat-stop-btn", onclick: () => this.#stop(), hidden: true }, ["Stop"]);
    this.#permLabelEl = h("span", { class: "perm-chip-text" }, ["Full access"]);
    this.#permDefaultBtn = h("button", {
      class: "perm-menu-option",
      onclick: (e) => {
        e.preventDefault();
        this.#setPermission(false);
      }
    }, [
      h("span", { class: "perm-menu-title" }, ["Default permissions"]),
      h("span", { class: "perm-menu-check" }, ["✓"])
    ]);
    this.#permFullBtn = h("button", {
      class: "perm-menu-option",
      onclick: (e) => {
        e.preventDefault();
        this.#setPermission(true);
      }
    }, [
      h("span", { class: "perm-menu-title" }, ["Full access"]),
      h("span", { class: "perm-menu-check" }, ["✓"])
    ]);
    this.#permDetailsEl = h("details", { class: "perm-selector" }, [
      h("summary", { class: "perm-chip" }, [
        h("span", { class: "perm-chip-icon" }, ["⛨"]),
        this.#permLabelEl,
        h("span", { class: "perm-chip-caret" }, ["▾"])
      ]),
      h("div", { class: "perm-menu" }, [
        this.#permDefaultBtn,
        this.#permFullBtn
      ])
    ]);
    const toggleRow = h("div", { class: "chat-perm-toggle-row" }, [this.#permDetailsEl]);
    this.#setPermission(true);
    const inputRow = h("div", { class: "chat-input-row" }, [
      this.#inputEl,
      this.#stopBtn,
      this.#sendBtn
    ]);
    this.#el = h("div", { class: "chat-view" }, [
      this.#messagesEl,
      this.#statusEl,
      toggleRow,
      inputRow
    ]);
    container.appendChild(this.#el);
  }
  renderTranscript(messages) {
    clearChildren(this.#messagesEl);
    this.#isWaiting = false;
    this.#hideStatus();
    for (const msg of messages) {
      this.#appendTranscriptMessage(msg);
    }
    this.#scrollToBottom();
  }
  appendStreamEvent(event) {
    const ev = event;
    if (ev.type === "system") {
      if (ev.subtype === "init") {
        this.#showStatus("Claude is thinking...");
        this.#isWaiting = true;
      }
      return;
    }
    if (ev.type === "assistant") {
      this.#hideStatus();
      this.#isWaiting = true;
      const content = ev.message?.content;
      if (!content || !Array.isArray(content))
        return;
      for (const block of content) {
        this.#renderContentBlock(block);
      }
      const hasToolUse = content.some((b) => b.type === "tool_use");
      if (hasToolUse) {
        this.#showStatus("Running tool...");
      } else {
        this.#showStatus("Claude is thinking...");
      }
      this.#scrollToBottom();
      return;
    }
    if (ev.type === "user") {
      const content = ev.message?.content;
      if (!content || !Array.isArray(content))
        return;
      for (const block of content) {
        if (block.type === "tool_result") {
          this.#hideStatus();
          const output = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
          this.#appendToolResult(block.tool_use_id ?? "", output, block.is_error === true);
        }
      }
      this.#showStatus("Claude is thinking...");
      this.#scrollToBottom();
      return;
    }
    if (ev.type === "result") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const cost = ev.total_cost_usd;
      const turns = ev.num_turns;
      if (cost != null) {
        this.#appendSystemInfo(`Done — ${turns} turn${turns !== 1 ? "s" : ""}, $${cost.toFixed(4)}`);
      }
      return;
    }
    if (ev.type === "error") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const msg = ev.error?.message ?? "Unknown error";
      this.#appendError(msg);
      return;
    }
    console.log("[chat-view] Unhandled event:", ev.type, ev);
  }
  appendUserMessage(text) {
    const bubble = h("div", { class: "chat-bubble user" });
    bubble.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
    this.#messagesEl.appendChild(bubble);
    this.#showStatus("Starting Claude...");
    this.#isWaiting = true;
    this.#scrollToBottom();
  }
  clear() {
    clearChildren(this.#messagesEl);
    this.#isWaiting = false;
    this.#hideStatus();
  }
  showToolApproval(req, respond) {
    const summary = summarizeToolInput(req.toolName, req.toolInput);
    const dialog = h("div", { class: "tool-approval-dialog" }, [
      h("div", { class: "tool-approval-header" }, [
        h("span", { class: "tool-icon" }, [toolIcon(req.toolName)]),
        h("span", { class: "tool-approval-name" }, [req.toolName]),
        summary ? h("span", { class: "tool-approval-summary" }, [summary]) : null
      ].filter(Boolean))
    ]);
    const details = formatToolDetails(req.toolName, req.toolInput);
    if (details) {
      dialog.appendChild(h("pre", { class: "tool-approval-details" }, [details]));
    }
    const actions = h("div", { class: "tool-approval-actions" }, [
      h("button", {
        class: "tool-perm-btn tool-perm-allow",
        onclick: () => {
          respond(true);
          dialog.classList.add("responded", "approved");
          actions.innerHTML = '<span class="tool-approval-status">Allowed</span>';
          this.#showStatus(`Running ${req.toolName}...`);
        }
      }, ["Allow"]),
      h("button", {
        class: "tool-perm-btn tool-perm-deny",
        onclick: () => {
          respond(false);
          dialog.classList.add("responded", "denied");
          actions.innerHTML = '<span class="tool-approval-status denied">Denied</span>';
          this.#hideStatus();
        }
      }, ["Deny"])
    ]);
    dialog.appendChild(actions);
    this.#messagesEl.appendChild(dialog);
    this.#showStatus(`Waiting for approval: ${req.toolName}`);
    this.#scrollToBottom();
  }
  focus() {
    this.#inputEl.focus();
  }
  #send() {
    if (this.#isWaiting)
      return;
    const text = this.#inputEl.value.trim();
    if (!text)
      return;
    this.#inputEl.value = "";
    this.#inputEl.style.height = "auto";
    const fullAccess = this.#fullAccess;
    this.appendUserMessage(text);
    this.#callbacks.onSendPrompt(text, fullAccess);
    this.#showStopButton();
  }
  #stop() {
    this.#callbacks.onStopSession?.();
    this.#hideStopButton();
    this.#hideStatus();
    this.#isWaiting = false;
  }
  #showStopButton() {
    this.#sendBtn.hidden = true;
    this.#stopBtn.hidden = false;
  }
  #hideStopButton() {
    this.#stopBtn.hidden = true;
    this.#sendBtn.hidden = false;
  }
  #renderContentBlock(block) {
    if (block.type === "text") {
      const bubble = h("div", { class: "chat-bubble assistant" });
      bubble.innerHTML = renderMarkdown(block.text);
      this.#messagesEl.appendChild(bubble);
    } else if (block.type === "tool_use") {
      if (block.name === "AskUserQuestion") {
        this.#renderAskUserQuestion(block);
        return;
      }
      const summary = summarizeToolInput(block.name, block.input);
      const details = formatToolDetails(block.name, block.input);
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          block.name,
          summary ? ` ${summary}` : ""
        ]),
        details ? h("div", { class: "tool-input" }) : null
      ].filter(Boolean));
      detailsPanel.open = shouldExpandTool(block.name);
      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel
      ]);
      if (details) {
        const detailsEl = qs(".tool-input", toolEvent);
        if (detailsEl) {
          detailsEl.innerHTML = renderToolContent(details);
        }
      }
      this.#messagesEl.appendChild(toolEvent);
      this.#showStatus(`Running ${block.name}...`);
    } else if (block.type === "tool_result") {
      this.#hideStatus();
      return;
    }
  }
  #renderAskUserQuestion(block) {
    const input = block.input;
    const questions = input?.questions ?? [];
    const dialog = h("div", { class: "chat-permission-dialog" });
    for (const q of questions) {
      const questionEl = h("div", { class: "perm-question" });
      if (q.header) {
        questionEl.appendChild(h("div", { class: "perm-header" }, [q.header]));
      }
      questionEl.appendChild(h("div", { class: "perm-text" }, [q.question ?? ""]));
      if (q.options && Array.isArray(q.options)) {
        const optionsEl = h("div", { class: "perm-options" });
        for (const opt of q.options) {
          const btn = h("button", {
            class: "perm-option-btn",
            onclick: () => {
              this.#callbacks.onSendPrompt(opt.label, this.#fullAccess);
              dialog.querySelectorAll("button").forEach((b) => b.disabled = true);
              dialog.classList.add("responded");
            }
          }, [opt.label]);
          if (opt.description) {
            btn.title = opt.description;
          }
          optionsEl.appendChild(btn);
        }
        questionEl.appendChild(optionsEl);
      }
      dialog.appendChild(questionEl);
    }
    this.#messagesEl.appendChild(dialog);
    this.#hideStatus();
    this.#isWaiting = false;
  }
  #appendToolResult(_toolUseId, _output, _isError) {
    return;
  }
  #appendTranscriptMessage(msg) {
    const isUser = msg.role === "user";
    if (msg.toolName && !isUser) {
      const summary = summarizeToolInput(msg.toolName, msg.toolInput);
      const details = formatToolDetails(msg.toolName, msg.toolInput ?? {});
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          msg.toolName,
          summary ? ` ${summary}` : ""
        ]),
        details ? h("div", { class: "tool-input" }) : null
      ].filter(Boolean));
      detailsPanel.open = shouldExpandTool(msg.toolName);
      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel
      ]);
      if (details) {
        const detailsEl = qs(".tool-input", toolEvent);
        if (detailsEl) {
          detailsEl.innerHTML = renderToolContent(details);
        }
      }
      this.#messagesEl.appendChild(toolEvent);
      return;
    }
    const bubble = h("div", {
      class: `chat-bubble ${isUser ? "user" : "assistant"}`
    });
    bubble.innerHTML = renderMarkdown(msg.content);
    this.#messagesEl.appendChild(bubble);
  }
  #appendSystemInfo(text) {
    const el = h("div", { class: "chat-system-info" }, [text]);
    this.#messagesEl.appendChild(el);
    this.#scrollToBottom();
  }
  #appendError(text) {
    const el = h("div", { class: "chat-error" }, [text]);
    this.#messagesEl.appendChild(el);
    this.#scrollToBottom();
  }
  #showStatus(text) {
    this.#statusEl.textContent = text;
    this.#statusEl.hidden = false;
  }
  #hideStatus() {
    this.#statusEl.hidden = true;
  }
  #scrollToBottom() {
    requestAnimationFrame(() => {
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
    });
  }
  #setPermission(fullAccess) {
    this.#fullAccess = fullAccess;
    this.#permLabelEl.textContent = fullAccess ? "Full access" : "Default permissions";
    this.#permDetailsEl.classList.toggle("full-access", fullAccess);
    this.#permDefaultBtn.classList.toggle("selected", !fullAccess);
    this.#permFullBtn.classList.toggle("selected", fullAccess);
    this.#permDetailsEl.open = false;
  }
  get element() {
    return this.#el;
  }
}
function toolIcon(toolName) {
  const icons = {
    Bash: "▸",
    Edit: "✎",
    Write: "✎",
    Read: "□",
    Glob: "⌕",
    Grep: "⌕",
    Task: "⮞",
    WebFetch: "↗"
  };
  return icons[toolName] ?? "•";
}
function summarizeToolInput(toolName, input) {
  if (!input)
    return "";
  switch (toolName) {
    case "Bash":
      return String(input.command ?? "").slice(0, 80);
    case "Edit":
    case "Write":
    case "Read":
      return basename(String(input.file_path ?? ""));
    case "Glob":
      return String(input.pattern ?? "");
    case "Grep":
      return String(input.pattern ?? "");
    case "WebFetch":
      return String(input.url ?? "");
    case "Task":
      return String(input.description ?? input.prompt ?? "").slice(0, 60);
    default:
      return "";
  }
}
function basename(filePath) {
  return filePath.split("/").pop() ?? filePath;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatToolDetails(toolName, input) {
  switch (toolName) {
    case "Bash":
      return `\`\`\`bash
${String(input.command ?? "")}
\`\`\``;
    case "Write": {
      const filePath = String(input.file_path ?? "");
      const content = String(input.content ?? "").slice(0, 4000);
      const added = content.split(`
`).filter((line) => line.length > 0).map((line) => `+${line}`).join(`
`);
      return `File: ${filePath}

\`\`\`diff
${added || "+(empty file)"}
\`\`\``;
    }
    case "Edit": {
      const filePath = String(input.file_path ?? "");
      const oldText = String(input.old_string ?? "").slice(0, 2000);
      const newText = String(input.new_string ?? "").slice(0, 2000);
      const diff = toUnifiedDiff(oldText, newText);
      return `File: ${filePath}

\`\`\`diff
${diff}
\`\`\``;
    }
    case "Read":
      return String(input.file_path ?? "");
    default:
      return null;
  }
}
function renderMarkdown(text) {
  const normalized = escapeHtml(text).replace(/\r\n?/g, `
`);
  const codeBlocks = [];
  const withCodePlaceholders = normalized.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const codeText = String(code).replace(/\n$/, "");
    const language = String(lang ?? "").trim().toLowerCase();
    const index = codeBlocks.push(language === "diff" ? renderInlineDiff(codeText) : `<pre class="code-block"><code>${codeText}</code></pre>`) - 1;
    return `@@CODE_BLOCK_${index}@@`;
  });
  const renderedText = withCodePlaceholders.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>').replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  return renderedText.replace(/@@CODE_BLOCK_(\d+)@@/g, (_match, idx) => {
    const block = codeBlocks[Number(idx)];
    return block ?? "";
  });
}
function renderToolContent(text) {
  const trimmed = text.trim();
  if (!trimmed)
    return "";
  if (trimmed.includes("```")) {
    return renderMarkdown(trimmed);
  }
  if (trimmed.includes(`
`)) {
    return `<pre class="code-block"><code>${escapeHtml(trimmed)}</code></pre>`;
  }
  return renderMarkdown(trimmed);
}
function toUnifiedDiff(oldText, newText) {
  const oldLines = oldText.split(`
`);
  const newLines = newText.split(`
`);
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i2 = n - 1;i2 >= 0; i2--) {
    for (let j2 = m - 1;j2 >= 0; j2--) {
      if (oldLines[i2] === newLines[j2]) {
        dp[i2][j2] = dp[i2 + 1][j2 + 1] + 1;
      } else {
        dp[i2][j2] = Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      }
    }
  }
  let i = 0;
  let j = 0;
  const out = [];
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${oldLines[i]}`);
      i++;
    } else {
      out.push(`+${newLines[j]}`);
      j++;
    }
  }
  while (i < n)
    out.push(`-${oldLines[i++]}`);
  while (j < m)
    out.push(`+${newLines[j++]}`);
  return out.length > 0 ? out.join(`
`) : "(no textual changes)";
}
function renderInlineDiff(diffText) {
  const rows = [];
  const lines = diffText.split(`
`);
  let oldLine = 1;
  let newLine = 1;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push(`<tr class="diff-hunk-header"><td class="line-no"></td><td class="line-content hunk-label">${escapeHtml(line)}</td></tr>`);
      continue;
    }
    let rowClass = "diff-context";
    if (line.startsWith("+")) {
      rowClass = "diff-add";
    } else if (line.startsWith("-")) {
      rowClass = "diff-delete";
    }
    let lineNo = "";
    if (line.startsWith("+")) {
      lineNo = String(newLine++);
    } else if (line.startsWith("-")) {
      lineNo = String(oldLine++);
    } else {
      lineNo = String(newLine);
      oldLine++;
      newLine++;
    }
    rows.push(`<tr class="diff-line ${rowClass}"><td class="line-no">${lineNo}</td><td class="line-content">${escapeHtml(line)}</td></tr>`);
  }
  return `<div class="chat-inline-diff"><table class="diff-table unified"><tbody>${rows.join("")}</tbody></table></div>`;
}
function shouldExpandTool(toolName) {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "write" || normalized === "edit" || normalized === "multiedit" || normalized === "remove" || normalized === "delete";
}

// src/mainview/components/diff-view.ts
class DiffView {
  #el;
  #toolbarEl;
  #contentEl;
  #files = [];
  #activeFile = null;
  #fileExpanded = new Map;
  #viewMode = "unified";
  constructor(container) {
    this.#toolbarEl = h("div", { class: "dv-toolbar" }, [
      h("span", { class: "dv-file-label" }, [""]),
      h("span", { class: "dv-toolbar-spacer" }),
      h("button", {
        class: "dv-toggle active",
        dataset: { view: "unified" },
        onclick: () => this.#setViewMode("unified")
      }, ["Unified"]),
      h("button", {
        class: "dv-toggle",
        dataset: { view: "split" },
        onclick: () => this.#setViewMode("split")
      }, ["Split"])
    ]);
    this.#contentEl = h("div", { class: "dv-content" });
    this.#el = h("div", { class: "diff-view" }, [
      this.#toolbarEl,
      this.#contentEl
    ]);
    container.appendChild(this.#el);
  }
  setFiles(files) {
    this.#files = files;
    const nextExpanded = new Map;
    for (const file of files) {
      nextExpanded.set(file.path, this.#fileExpanded.get(file.path) ?? true);
    }
    this.#fileExpanded = nextExpanded;
    if (this.#activeFile && !files.some((f) => f.path === this.#activeFile)) {
      this.#activeFile = null;
    }
    this.#renderDiff();
  }
  showFile(path) {
    this.#activeFile = path;
    this.#fileExpanded.set(path, true);
    this.#renderDiff();
    this.#scrollToFile(path);
  }
  clear() {
    this.#files = [];
    this.#activeFile = null;
    this.#fileExpanded.clear();
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    if (label)
      label.textContent = "";
    clearChildren(this.#contentEl);
    this.#contentEl.appendChild(h("div", { class: "dv-empty" }, ["No changes"]));
  }
  #renderDiff() {
    clearChildren(this.#contentEl);
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    if (this.#files.length === 0) {
      if (label)
        label.textContent = "";
      this.#contentEl.appendChild(h("div", { class: "dv-empty" }, ["No changes"]));
      return;
    }
    if (label) {
      label.textContent = `${this.#files.length} file${this.#files.length !== 1 ? "s" : ""} changed`;
    }
    for (const file of this.#files) {
      this.#contentEl.appendChild(this.#renderFileSection(file));
    }
    if (this.#activeFile) {
      this.#scrollToFile(this.#activeFile);
    }
  }
  #renderFileSection(file) {
    const statusSymbol = {
      added: "+",
      deleted: "−",
      modified: "∙",
      renamed: "R"
    }[file.status];
    const { adds, dels } = countFileChanges(file);
    const delta = [
      adds > 0 ? h("span", { class: "dv-delta-add" }, [`+${adds}`]) : null,
      dels > 0 ? h("span", { class: "dv-delta-del" }, [`-${dels}`]) : null
    ].filter(Boolean);
    const details = h("details", {
      class: `dv-file-section${file.path === this.#activeFile ? " active" : ""}`,
      dataset: { filePath: file.path }
    });
    details.open = this.#fileExpanded.get(file.path) ?? true;
    details.addEventListener("toggle", () => {
      this.#fileExpanded.set(file.path, details.open);
    });
    details.appendChild(h("summary", { class: "dv-file-summary" }, [
      h("span", { class: `dv-file-status dv-file-status-${file.status}` }, [statusSymbol]),
      h("span", { class: "dv-file-main" }, [
        h("span", { class: "dv-file-path" }, [file.path]),
        delta.length > 0 ? h("span", { class: "dv-file-delta" }, delta) : null
      ].filter(Boolean)),
      file.isBinary ? h("span", { class: "dv-file-binary" }, ["bin"]) : null
    ].filter(Boolean)));
    const body = h("div", { class: "dv-file-body" });
    if (file.isBinary) {
      body.appendChild(h("div", { class: "dv-file-empty" }, ["Binary file changed"]));
    } else if (file.hunks.length === 0) {
      body.appendChild(h("div", { class: "dv-file-empty" }, ["Empty diff"]));
    } else if (this.#viewMode === "unified") {
      body.appendChild(this.#buildUnifiedTable(file));
    } else {
      body.appendChild(this.#buildSplitTable(file));
    }
    details.appendChild(body);
    return details;
  }
  #buildUnifiedTable(file) {
    const table = h("table", { class: "diff-table unified" });
    for (const hunk of file.hunks) {
      table.appendChild(h("tr", { class: "diff-hunk-header" }, [
        h("td", { class: "line-no" }),
        h("td", { class: "line-no" }),
        h("td", { class: "line-content hunk-label" }, [hunk.header])
      ]));
      for (const line of hunk.lines) {
        const lineClass = `diff-line diff-${line.type}`;
        const prefix = { add: "+", delete: "-", context: " " }[line.type];
        table.appendChild(h("tr", { class: lineClass }, [
          h("td", { class: "line-no" }, [
            line.oldLineNo !== null ? String(line.oldLineNo) : ""
          ]),
          h("td", { class: "line-no" }, [
            line.newLineNo !== null ? String(line.newLineNo) : ""
          ]),
          h("td", { class: "line-content" }, [prefix + line.content])
        ]));
      }
    }
    return table;
  }
  #buildSplitTable(file) {
    const table = h("table", { class: "diff-table split" });
    for (const hunk of file.hunks) {
      table.appendChild(h("tr", { class: "diff-hunk-header" }, [
        h("td", { class: "line-no" }),
        h("td", { class: "line-content hunk-label" }),
        h("td", { class: "line-no" }),
        h("td", { class: "line-content hunk-label" }, [hunk.header])
      ]));
      const pairs = pairLines(hunk.lines);
      for (const [left, right] of pairs) {
        table.appendChild(h("tr", { class: "diff-line" }, [
          h("td", { class: "line-no" }, [
            left?.oldLineNo != null ? String(left.oldLineNo) : ""
          ]),
          h("td", {
            class: `line-content${left ? ` diff-${left.type}` : ""}`
          }, [left ? left.content : ""]),
          h("td", { class: "line-no" }, [
            right?.newLineNo != null ? String(right.newLineNo) : ""
          ]),
          h("td", {
            class: `line-content${right ? ` diff-${right.type}` : ""}`
          }, [right ? right.content : ""])
        ]));
      }
    }
    return table;
  }
  #setViewMode(mode) {
    this.#viewMode = mode;
    for (const btn of this.#toolbarEl.querySelectorAll("[data-view]")) {
      btn.classList.toggle("active", btn.dataset.view === mode);
    }
    this.#renderDiff();
  }
  #scrollToFile(path) {
    requestAnimationFrame(() => {
      const target = Array.from(this.#contentEl.querySelectorAll(".dv-file-section")).find((el) => el.dataset.filePath === path);
      if (!target)
        return;
      target.scrollIntoView({ block: "nearest" });
    });
  }
  get element() {
    return this.#el;
  }
}
function countFileChanges(file) {
  let adds = 0;
  let dels = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add")
        adds++;
      if (line.type === "delete")
        dels++;
    }
  }
  return { adds, dels };
}
function pairLines(lines) {
  const result = [];
  const deletes = [];
  const adds = [];
  const flush = () => {
    const max = Math.max(deletes.length, adds.length);
    for (let i = 0;i < max; i++) {
      result.push([deletes[i] ?? null, adds[i] ?? null]);
    }
    deletes.length = 0;
    adds.length = 0;
  };
  for (const line of lines) {
    if (line.type === "context") {
      flush();
      result.push([line, line]);
    } else if (line.type === "delete") {
      deletes.push(line);
    } else if (line.type === "add") {
      adds.push(line);
    }
  }
  flush();
  return result;
}

// src/mainview/components/files-panel.ts
class FilesPanel {
  #el;
  #listEl;
  #countEl;
  #callbacks;
  #activeFile = null;
  #files = [];
  #scope = "last_turn";
  #scopeLastBtn;
  #scopeAllBtn;
  constructor(container, callbacks) {
    this.#callbacks = callbacks;
    this.#countEl = h("span", { class: "fp-count" }, ["0"]);
    this.#scopeLastBtn = h("button", {
      class: "fp-scope-btn active",
      onclick: () => this.setScope("last_turn", true)
    }, ["Last turn"]);
    this.#scopeAllBtn = h("button", {
      class: "fp-scope-btn",
      onclick: () => this.setScope("all", true)
    }, ["All"]);
    const header = h("div", { class: "fp-header" }, [
      h("div", { class: "fp-header-left" }, [
        h("span", { class: "fp-title" }, ["Files Changed"]),
        this.#countEl
      ]),
      h("div", { class: "fp-scope-toggle" }, [
        this.#scopeLastBtn,
        this.#scopeAllBtn
      ])
    ]);
    this.#listEl = h("div", { class: "fp-list" });
    this.#el = h("div", { class: "files-panel" }, [
      header,
      this.#listEl
    ]);
    container.appendChild(this.#el);
  }
  render(files) {
    this.#files = files;
    this.#countEl.textContent = String(files.length);
    clearChildren(this.#listEl);
    if (files.length === 0) {
      this.#listEl.appendChild(h("div", { class: "fp-empty" }, [
        this.#scope === "last_turn" ? "No changes in last turn" : "No changes"
      ]));
      return;
    }
    for (const file of files) {
      this.#listEl.appendChild(this.#renderFile(file));
    }
  }
  setActiveFile(path) {
    this.#activeFile = path;
    for (const item of this.#listEl.querySelectorAll(".fp-file-item")) {
      item.classList.toggle("active", item.dataset.filePath === path);
    }
  }
  clear() {
    this.#files = [];
    this.#activeFile = null;
    this.#countEl.textContent = "0";
    clearChildren(this.#listEl);
    this.#listEl.appendChild(h("div", { class: "fp-empty" }, [
      this.#scope === "last_turn" ? "No changes in last turn" : "No changes"
    ]));
  }
  setScope(scope, notify = false) {
    this.#scope = scope;
    this.#scopeLastBtn.classList.toggle("active", scope === "last_turn");
    this.#scopeAllBtn.classList.toggle("active", scope === "all");
    if (notify) {
      this.#callbacks.onScopeChange(scope);
    }
  }
  #renderFile(file) {
    const statusIcon = { added: "+", deleted: "−", modified: "∙", renamed: "R" }[file.status];
    const statusClass = `fp-status-${file.status}`;
    const fileName = file.path.split("/").pop() ?? file.path;
    const dirPath = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
    const { adds, dels } = countFileChanges2(file);
    const delta = [
      adds > 0 ? h("span", { class: "fp-delta-add" }, [`+${adds}`]) : null,
      dels > 0 ? h("span", { class: "fp-delta-del" }, [`-${dels}`]) : null
    ].filter(Boolean);
    return h("div", {
      class: `fp-file-item${file.path === this.#activeFile ? " active" : ""}`,
      dataset: { filePath: file.path },
      onclick: () => {
        this.setActiveFile(file.path);
        this.#callbacks.onSelectFile(file.path);
      }
    }, [
      h("span", { class: `fp-status ${statusClass}` }, [statusIcon]),
      h("div", { class: "fp-file-info" }, [
        h("div", { class: "fp-file-name-row" }, [
          h("span", { class: "fp-file-name" }, [fileName]),
          delta.length > 0 ? h("span", { class: "fp-file-delta" }, delta) : null
        ].filter(Boolean)),
        dirPath ? h("span", { class: "fp-file-dir" }, [dirPath]) : null
      ].filter(Boolean)),
      file.isBinary ? h("span", { class: "fp-binary-tag" }, ["bin"]) : null
    ].filter(Boolean));
  }
  get element() {
    return this.#el;
  }
}
function countFileChanges2(file) {
  let adds = 0;
  let dels = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add")
        adds++;
      if (line.type === "delete")
        dels++;
    }
  }
  return { adds, dels };
}

// src/mainview/index.ts
var rpc = Electroview.defineRPC({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      snapshotUpdate: (snapshot) => {
        appState.update((s) => ({ ...s, snapshot }));
      },
      sessionStream: ({
        sessionId,
        event
      }) => {
        const state = appState.get();
        if (state.activeSessionId === sessionId && chatView) {
          chatView.appendStreamEvent(event);
        }
        if (state.activeSessionId === sessionId && state.activeWorkspace && (event.type === "result" || isDiffMutationEvent(event))) {
          scheduleDiffRefresh(state.activeWorkspace, state.diffScope, event.type === "result" ? 0 : 120);
        }
      },
      sessionIdResolved: ({
        tempId,
        realId
      }) => {
        const state = appState.get();
        const live = new Set(state.liveSessions);
        if (live.has(tempId)) {
          live.delete(tempId);
          live.add(realId);
        }
        const updates = { liveSessions: live };
        if (state.activeSessionId === tempId) {
          updates.activeSessionId = realId;
        }
        appState.update((s) => ({ ...s, ...updates }));
      },
      toolApproval: (req) => {
        console.log("[webview] Tool approval request:", req.toolName, req.toolUseId, req.sessionId);
        const state = appState.get();
        if (chatView && state.activeSessionId === req.sessionId) {
          chatView.showToolApproval(req, async (allow) => {
            try {
              await rpc.request.respondToolApproval({
                toolUseId: req.toolUseId,
                allow
              });
            } catch (err) {
              console.error("Failed to respond to tool approval:", err);
            }
          });
        }
      },
      sessionEnded: ({
        sessionId,
        exitCode
      }) => {
        console.log(`Session ${sessionId} ended with code ${exitCode}`);
        const state = appState.get();
        const live = new Set(state.liveSessions);
        live.delete(sessionId);
        appState.update((s) => ({ ...s, liveSessions: live }));
        if (state.activeWorkspace) {
          loadDiff(state.activeWorkspace);
        }
      }
    }
  }
});
var _electrobun = new browser_default.Electroview({ rpc });
var appState = new Store({
  snapshot: null,
  workspaces: [],
  expandedWorkspaces: new Set,
  activeWorkspace: null,
  activeSessionId: null,
  diffScope: "last_turn",
  historySessions: {},
  liveSessions: new Set,
  customSessionNames: {}
});
var panelLayout;
var sidebar;
var chatView;
var diffView;
var filesPanel;
var diffRefreshTimer = null;
function init() {
  const panelsContainer = qs("#panels");
  panelLayout = new PanelLayout(panelsContainer, [
    { id: "workspaces", minWidth: 200, defaultWidth: 0, hidden: true },
    { id: "chat", minWidth: 280, defaultWidth: 30 },
    { id: "diff", minWidth: 300, defaultWidth: 60 },
    { id: "files", minWidth: 140, defaultWidth: 10 }
  ]);
  const wsPanel = panelLayout.getPanel("workspaces");
  const chatPanel = panelLayout.getPanel("chat");
  const diffPanel = panelLayout.getPanel("diff");
  const filesP = panelLayout.getPanel("files");
  sidebar = new Sidebar(wsPanel, {
    onSelectSession: (sessionId, workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: sessionId,
        activeWorkspace: workspacePath
      }));
      loadSessionTranscript(sessionId);
      loadDiff(workspacePath);
    },
    onNewSession: (workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: null,
        activeWorkspace: workspacePath
      }));
      chatView.clear();
      chatView.focus();
      loadDiff(workspacePath);
    },
    onAddWorkspace: () => openWorkspace(),
    onRemoveWorkspace: (path) => removeWorkspace(path),
    onToggleWorkspace: (path) => {
      const state = appState.get();
      const wasExpanded = state.expandedWorkspaces.has(path);
      appState.update((s) => {
        const expanded = new Set(s.expandedWorkspaces);
        if (expanded.has(path))
          expanded.delete(path);
        else
          expanded.add(path);
        return { ...s, expandedWorkspaces: expanded };
      });
      if (!wasExpanded && !state.historySessions[path]) {
        loadSessionHistory(path);
      }
    },
    onRenameSession: async (sessionId, newName) => {
      try {
        await rpc.request.renameSession({ sessionId, newName });
        appState.update((s) => ({
          ...s,
          customSessionNames: { ...s.customSessionNames, [sessionId]: newName }
        }));
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    }
  });
  chatView = new ChatView(chatPanel, {
    onStopSession: async () => {
      const state = appState.get();
      if (!state.activeSessionId)
        return;
      try {
        await rpc.request.killSession({
          sessionId: state.activeSessionId
        });
      } catch (err) {
        console.error("Failed to kill session:", err);
      }
    },
    onSendPrompt: async (prompt, fullAccess) => {
      const state = appState.get();
      const cwd = state.activeWorkspace;
      if (!cwd) {
        openWorkspace();
        return;
      }
      try {
        const isLive = state.activeSessionId && state.liveSessions.has(state.activeSessionId);
        if (state.activeSessionId && isLive) {
          await rpc.request.sendFollowUp({
            sessionId: state.activeSessionId,
            text: prompt,
            fullAccess
          });
        } else {
          const { sessionId } = await rpc.request.sendPrompt({
            prompt,
            cwd,
            fullAccess,
            sessionId: state.activeSessionId ?? undefined
          });
          const live = new Set(state.liveSessions);
          live.add(sessionId);
          appState.update((s) => ({ ...s, activeSessionId: sessionId, liveSessions: live }));
        }
      } catch (err) {
        console.error("Failed to send prompt:", err);
      }
    }
  });
  diffView = new DiffView(diffPanel);
  filesPanel = new FilesPanel(filesP, {
    onSelectFile: (path) => {
      diffView.showFile(path);
    },
    onScopeChange: (scope) => {
      appState.update((s) => ({ ...s, diffScope: scope }));
      const state = appState.get();
      if (state.activeWorkspace) {
        loadDiff(state.activeWorkspace, scope);
      }
    }
  });
  qs("#btn-toggle-workspaces")?.addEventListener("click", () => {
    panelLayout.togglePanel("workspaces");
    qs("#btn-toggle-workspaces")?.classList.toggle("active", panelLayout.isPanelVisible("workspaces"));
  });
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "b") {
      e.preventDefault();
      panelLayout.togglePanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.toggle("active", panelLayout.isPanelVisible("workspaces"));
    }
    if (mod && e.key === "n") {
      e.preventDefault();
      const state = appState.get();
      if (state.activeWorkspace) {
        appState.update((s) => ({ ...s, activeSessionId: null }));
        chatView.clear();
        chatView.focus();
      } else {
        openWorkspace();
      }
    }
    if (mod && e.key === "o") {
      e.preventDefault();
      openWorkspace();
    }
  });
  appState.subscribe((state) => {
    const wsData = buildWorkspaceData(state);
    sidebar.render(wsData);
    sidebar.setActiveSession(state.activeSessionId);
  });
  loadWorkspaces();
  loadSessionNames();
}
async function loadSessionTranscript(sessionId) {
  try {
    const state = appState.get();
    let transcriptPath;
    for (const sessions of Object.values(state.historySessions)) {
      const found = sessions.find((s) => s.sessionId === sessionId);
      if (found) {
        transcriptPath = found.transcriptPath;
        break;
      }
    }
    const messages = await rpc.request.getTranscript({
      sessionId,
      transcriptPath
    });
    chatView.renderTranscript(messages);
  } catch (err) {
    console.error("Failed to load transcript:", err);
    chatView.clear();
  }
}
async function loadSessionHistory(cwd) {
  try {
    const history = await rpc.request.getSessionHistory({ cwd });
    appState.update((s) => ({
      ...s,
      historySessions: { ...s.historySessions, [cwd]: history }
    }));
  } catch (err) {
    console.error("Failed to load session history:", err);
  }
}
async function loadDiff(cwd, scope) {
  try {
    const selectedScope = scope ?? appState.get().diffScope;
    filesPanel.setScope(selectedScope);
    const files = await rpc.request.getDiff({
      cwd,
      scope: selectedScope
    });
    filesPanel.render(files);
    diffView.setFiles(files);
    if (files.length > 0) {
      filesPanel.setActiveFile(files[0].path);
      diffView.showFile(files[0].path);
    } else {
      diffView.clear();
    }
  } catch (err) {
    console.error("Failed to load diff:", err);
    filesPanel.clear();
    diffView.clear();
  }
}
function scheduleDiffRefresh(cwd, scope, delayMs) {
  if (diffRefreshTimer) {
    clearTimeout(diffRefreshTimer);
  }
  diffRefreshTimer = setTimeout(() => {
    diffRefreshTimer = null;
    loadDiff(cwd, scope);
  }, delayMs);
}
function isDiffMutationEvent(event) {
  const ev = event;
  if (ev.type !== "user")
    return false;
  const toolResult = ev.tool_use_result;
  if (!toolResult || typeof toolResult !== "object")
    return false;
  const kind = String(toolResult.type ?? "").toLowerCase();
  if (kind === "create" || kind === "update" || kind === "delete" || kind === "rename") {
    return true;
  }
  const hasPatch = Array.isArray(toolResult.structuredPatch) && toolResult.structuredPatch.length > 0;
  return hasPatch;
}
async function loadWorkspaces() {
  try {
    const workspaces = await rpc.request.getWorkspaces({});
    const expanded = new Set;
    if (workspaces.length > 0) {
      expanded.add(workspaces[0]);
    }
    appState.update((s) => ({
      ...s,
      workspaces,
      expandedWorkspaces: expanded,
      activeWorkspace: workspaces[0] ?? null
    }));
    if (workspaces.length > 0) {
      panelLayout.showPanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.add("active");
      loadDiff(workspaces[0], appState.get().diffScope);
      loadSessionHistory(workspaces[0]);
    }
  } catch {}
}
async function loadSessionNames() {
  try {
    const names = await rpc.request.getSessionNames({});
    appState.update((s) => ({
      ...s,
      customSessionNames: names
    }));
  } catch (err) {
    console.error("Failed to load session names:", err);
  }
}
async function openWorkspace() {
  try {
    const dir = await rpc.request.pickDirectory({});
    if (!dir)
      return;
    await rpc.request.addWorkspace({ path: dir });
    const state = appState.get();
    const expanded = new Set(state.expandedWorkspaces);
    expanded.add(dir);
    appState.update((s) => ({
      ...s,
      workspaces: [dir, ...s.workspaces.filter((w) => w !== dir)],
      expandedWorkspaces: expanded,
      activeWorkspace: dir
    }));
    panelLayout.showPanel("workspaces");
    qs("#btn-toggle-workspaces")?.classList.add("active");
    loadDiff(dir, appState.get().diffScope);
    loadSessionHistory(dir);
  } catch (err) {
    console.error("Failed to pick directory:", err);
  }
}
async function removeWorkspace(path) {
  try {
    await rpc.request.removeWorkspace({ path });
    appState.update((s) => {
      const workspaces = s.workspaces.filter((w) => w !== path);
      const expanded = new Set(s.expandedWorkspaces);
      expanded.delete(path);
      return {
        ...s,
        workspaces,
        expandedWorkspaces: expanded,
        activeWorkspace: s.activeWorkspace === path ? workspaces[0] ?? null : s.activeWorkspace
      };
    });
  } catch (err) {
    console.error("Failed to remove workspace:", err);
  }
}
function buildWorkspaceData(state) {
  const liveSessions = state.snapshot ? buildSessionList(state.snapshot) : [];
  return state.workspaces.map((wsPath) => {
    const name = wsPath.split("/").pop() ?? wsPath;
    const wsLive = liveSessions.filter((s) => s.cwd === wsPath);
    const liveIds = new Set(wsLive.map((s) => s.sessionId));
    const history = (state.historySessions[wsPath] ?? []).filter((h2) => !liveIds.has(h2.sessionId)).map(historyToSessionInfo);
    const allSessions = [...wsLive, ...history].map((s) => ({
      ...s,
      topic: state.customSessionNames[s.sessionId] ?? s.topic
    }));
    return {
      path: wsPath,
      name,
      sessions: allSessions,
      expanded: state.expandedWorkspaces.has(wsPath)
    };
  });
}
function historyToSessionInfo(h2) {
  return {
    sessionId: h2.sessionId,
    topic: h2.topic,
    prompt: h2.prompt,
    cwd: h2.cwd,
    activity: "finished",
    model: h2.model,
    contextPercentage: null,
    currentToolLabel: null,
    startedAt: h2.startedAt ?? "",
    updatedAt: h2.lastActiveAt ?? h2.startedAt ?? "",
    isAppSpawned: false,
    transcriptPath: h2.transcriptPath
  };
}
function buildSessionList(snapshot) {
  const seen = new Set;
  const result = [];
  for (const task of snapshot.tasks) {
    if (seen.has(task.sessionId))
      continue;
    seen.add(task.sessionId);
    let activity = "idle";
    if (task.endedAt || ["completed", "error", "cancelled"].includes(task.status)) {
      activity = "finished";
    } else if (task.status === "running") {
      activity = "working";
    } else if (task.status === "waiting_for_input") {
      activity = "waiting_for_input";
    } else if (task.status === "waiting") {
      activity = "waiting";
    }
    result.push({
      sessionId: task.sessionId,
      topic: task.topic,
      prompt: task.prompt,
      cwd: task.cwd,
      activity,
      model: task.model,
      contextPercentage: task.contextPercentage,
      currentToolLabel: task.currentToolLabel,
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
      isAppSpawned: false,
      transcriptPath: task.transcriptPath
    });
  }
  return result;
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
