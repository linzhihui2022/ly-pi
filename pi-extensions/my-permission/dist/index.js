// index.ts
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// ../../node_modules/.bun/open@10.2.0/node_modules/open/index.js
import process7 from "node:process";
import { Buffer } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify as promisify5 } from "node:util";
import childProcess from "node:child_process";
import fs5, { constants as fsConstants2 } from "node:fs/promises";

// ../../node_modules/.bun/wsl-utils@0.1.0/node_modules/wsl-utils/index.js
import process3 from "node:process";
import fs4, { constants as fsConstants } from "node:fs/promises";

// ../../node_modules/.bun/is-wsl@3.1.1/node_modules/is-wsl/index.js
import process2 from "node:process";
import os from "node:os";
import fs3 from "node:fs";

// ../../node_modules/.bun/is-inside-container@1.0.0/node_modules/is-inside-container/index.js
import fs2 from "node:fs";

// ../../node_modules/.bun/is-docker@3.0.0/node_modules/is-docker/index.js
import fs from "node:fs";
var isDockerCached;
function hasDockerEnv() {
  try {
    fs.statSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}
function hasDockerCGroup() {
  try {
    return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
  } catch {
    return false;
  }
}
function isDocker() {
  if (isDockerCached === undefined) {
    isDockerCached = hasDockerEnv() || hasDockerCGroup();
  }
  return isDockerCached;
}

// ../../node_modules/.bun/is-inside-container@1.0.0/node_modules/is-inside-container/index.js
var cachedResult;
var hasContainerEnv = () => {
  try {
    fs2.statSync("/run/.containerenv");
    return true;
  } catch {
    return false;
  }
};
function isInsideContainer() {
  if (cachedResult === undefined) {
    cachedResult = hasContainerEnv() || isDocker();
  }
  return cachedResult;
}

// ../../node_modules/.bun/is-wsl@3.1.1/node_modules/is-wsl/index.js
var isWsl = () => {
  if (process2.platform !== "linux") {
    return false;
  }
  if (os.release().toLowerCase().includes("microsoft")) {
    if (isInsideContainer()) {
      return false;
    }
    return true;
  }
  try {
    if (fs3.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft")) {
      return !isInsideContainer();
    }
  } catch {}
  if (fs3.existsSync("/proc/sys/fs/binfmt_misc/WSLInterop") || fs3.existsSync("/run/WSL")) {
    return !isInsideContainer();
  }
  return false;
};
var is_wsl_default = process2.env.__IS_WSL_TEST__ ? isWsl : isWsl();

// ../../node_modules/.bun/wsl-utils@0.1.0/node_modules/wsl-utils/index.js
var wslDrivesMountPoint = (() => {
  const defaultMountPoint = "/mnt/";
  let mountPoint;
  return async function() {
    if (mountPoint) {
      return mountPoint;
    }
    const configFilePath = "/etc/wsl.conf";
    let isConfigFileExists = false;
    try {
      await fs4.access(configFilePath, fsConstants.F_OK);
      isConfigFileExists = true;
    } catch {}
    if (!isConfigFileExists) {
      return defaultMountPoint;
    }
    const configContent = await fs4.readFile(configFilePath, { encoding: "utf8" });
    const configMountPoint = /(?<!#.*)root\s*=\s*(?<mountPoint>.*)/g.exec(configContent);
    if (!configMountPoint) {
      return defaultMountPoint;
    }
    mountPoint = configMountPoint.groups.mountPoint.trim();
    mountPoint = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
    return mountPoint;
  };
})();
var powerShellPathFromWsl = async () => {
  const mountPoint = await wslDrivesMountPoint();
  return `${mountPoint}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`;
};
var powerShellPath = async () => {
  if (is_wsl_default) {
    return powerShellPathFromWsl();
  }
  return `${process3.env.SYSTEMROOT || process3.env.windir || String.raw`C:\Windows`}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
};

// ../../node_modules/.bun/define-lazy-prop@3.0.0/node_modules/define-lazy-prop/index.js
function defineLazyProperty(object, propertyName, valueGetter) {
  const define = (value) => Object.defineProperty(object, propertyName, { value, enumerable: true, writable: true });
  Object.defineProperty(object, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      const result = valueGetter();
      define(result);
      return result;
    },
    set(value) {
      define(value);
    }
  });
  return object;
}

// ../../node_modules/.bun/default-browser@5.5.0/node_modules/default-browser/index.js
import { promisify as promisify4 } from "node:util";
import process6 from "node:process";
import { execFile as execFile4 } from "node:child_process";

// ../../node_modules/.bun/default-browser-id@5.0.1/node_modules/default-browser-id/index.js
import { promisify } from "node:util";
import process4 from "node:process";
import { execFile } from "node:child_process";
var execFileAsync = promisify(execFile);
async function defaultBrowserId() {
  if (process4.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const { stdout } = await execFileAsync("defaults", ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
  const match = /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(stdout);
  const browserId = match?.groups.id ?? "com.apple.Safari";
  if (browserId === "com.apple.safari") {
    return "com.apple.Safari";
  }
  return browserId;
}

// ../../node_modules/.bun/run-applescript@7.1.0/node_modules/run-applescript/index.js
import process5 from "node:process";
import { promisify as promisify2 } from "node:util";
import { execFile as execFile2, execFileSync } from "node:child_process";
var execFileAsync2 = promisify2(execFile2);
async function runAppleScript(script, { humanReadableOutput = true, signal } = {}) {
  if (process5.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const outputArguments = humanReadableOutput ? [] : ["-ss"];
  const execOptions = {};
  if (signal) {
    execOptions.signal = signal;
  }
  const { stdout } = await execFileAsync2("osascript", ["-e", script, outputArguments], execOptions);
  return stdout.trim();
}

// ../../node_modules/.bun/bundle-name@4.1.0/node_modules/bundle-name/index.js
async function bundleName(bundleId) {
  return runAppleScript(`tell application "Finder" to set app_path to application file id "${bundleId}" as string
tell application "System Events" to get value of property list item "CFBundleName" of property list file (app_path & ":Contents:Info.plist")`);
}

// ../../node_modules/.bun/default-browser@5.5.0/node_modules/default-browser/windows.js
import { promisify as promisify3 } from "node:util";
import { execFile as execFile3 } from "node:child_process";
var execFileAsync3 = promisify3(execFile3);
var windowsBrowserProgIds = {
  MSEdgeHTM: { name: "Edge", id: "com.microsoft.edge" },
  MSEdgeBHTML: { name: "Edge Beta", id: "com.microsoft.edge.beta" },
  MSEdgeDHTML: { name: "Edge Dev", id: "com.microsoft.edge.dev" },
  AppXq0fevzme2pys62n3e0fbqa7peapykr8v: { name: "Edge", id: "com.microsoft.edge.old" },
  ChromeHTML: { name: "Chrome", id: "com.google.chrome" },
  ChromeBHTML: { name: "Chrome Beta", id: "com.google.chrome.beta" },
  ChromeDHTML: { name: "Chrome Dev", id: "com.google.chrome.dev" },
  ChromiumHTM: { name: "Chromium", id: "org.chromium.Chromium" },
  BraveHTML: { name: "Brave", id: "com.brave.Browser" },
  BraveBHTML: { name: "Brave Beta", id: "com.brave.Browser.beta" },
  BraveDHTML: { name: "Brave Dev", id: "com.brave.Browser.dev" },
  BraveSSHTM: { name: "Brave Nightly", id: "com.brave.Browser.nightly" },
  FirefoxURL: { name: "Firefox", id: "org.mozilla.firefox" },
  OperaStable: { name: "Opera", id: "com.operasoftware.Opera" },
  VivaldiHTM: { name: "Vivaldi", id: "com.vivaldi.Vivaldi" },
  "IE.HTTP": { name: "Internet Explorer", id: "com.microsoft.ie" }
};
var _windowsBrowserProgIdMap = new Map(Object.entries(windowsBrowserProgIds));

class UnknownBrowserError extends Error {
}
async function defaultBrowser(_execFileAsync = execFileAsync3) {
  const { stdout } = await _execFileAsync("reg", [
    "QUERY",
    " HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
    "/v",
    "ProgId"
  ]);
  const match = /ProgId\s*REG_SZ\s*(?<id>\S+)/.exec(stdout);
  if (!match) {
    throw new UnknownBrowserError(`Cannot find Windows browser in stdout: ${JSON.stringify(stdout)}`);
  }
  const { id } = match.groups;
  const dotIndex = id.lastIndexOf(".");
  const hyphenIndex = id.lastIndexOf("-");
  const baseIdByDot = dotIndex === -1 ? undefined : id.slice(0, dotIndex);
  const baseIdByHyphen = hyphenIndex === -1 ? undefined : id.slice(0, hyphenIndex);
  return windowsBrowserProgIds[id] ?? windowsBrowserProgIds[baseIdByDot] ?? windowsBrowserProgIds[baseIdByHyphen] ?? { name: id, id };
}

// ../../node_modules/.bun/default-browser@5.5.0/node_modules/default-browser/index.js
var execFileAsync4 = promisify4(execFile4);
var titleize = (string) => string.toLowerCase().replaceAll(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
async function defaultBrowser2() {
  if (process6.platform === "darwin") {
    const id = await defaultBrowserId();
    const name = await bundleName(id);
    return { name, id };
  }
  if (process6.platform === "linux") {
    const { stdout } = await execFileAsync4("xdg-mime", ["query", "default", "x-scheme-handler/http"]);
    const id = stdout.trim();
    const name = titleize(id.replace(/.desktop$/, "").replace("-", " "));
    return { name, id };
  }
  if (process6.platform === "win32") {
    return defaultBrowser();
  }
  throw new Error("Only macOS, Linux, and Windows are supported");
}

// ../../node_modules/.bun/open@10.2.0/node_modules/open/index.js
var execFile5 = promisify5(childProcess.execFile);
var __dirname2 = path.dirname(fileURLToPath(import.meta.url));
var localXdgOpenPath = path.join(__dirname2, "xdg-open");
var { platform, arch } = process7;
async function getWindowsDefaultBrowserFromWsl() {
  const powershellPath = await powerShellPath();
  const rawCommand = String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`;
  const encodedCommand = Buffer.from(rawCommand, "utf16le").toString("base64");
  const { stdout } = await execFile5(powershellPath, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedCommand
  ], { encoding: "utf8" });
  const progId = stdout.trim();
  const browserMap = {
    ChromeHTML: "com.google.chrome",
    BraveHTML: "com.brave.Browser",
    MSEdgeHTM: "com.microsoft.edge",
    FirefoxURL: "org.mozilla.firefox"
  };
  return browserMap[progId] ? { id: browserMap[progId] } : {};
}
var pTryEach = async (array, mapper) => {
  let latestError;
  for (const item of array) {
    try {
      return await mapper(item);
    } catch (error) {
      latestError = error;
    }
  }
  throw latestError;
};
var baseOpen = async (options) => {
  options = {
    wait: false,
    background: false,
    newInstance: false,
    allowNonzeroExitCode: false,
    ...options
  };
  if (Array.isArray(options.app)) {
    return pTryEach(options.app, (singleApp) => baseOpen({
      ...options,
      app: singleApp
    }));
  }
  let { name: app, arguments: appArguments = [] } = options.app ?? {};
  appArguments = [...appArguments];
  if (Array.isArray(app)) {
    return pTryEach(app, (appName) => baseOpen({
      ...options,
      app: {
        name: appName,
        arguments: appArguments
      }
    }));
  }
  if (app === "browser" || app === "browserPrivate") {
    const ids = {
      "com.google.chrome": "chrome",
      "google-chrome.desktop": "chrome",
      "com.brave.Browser": "brave",
      "org.mozilla.firefox": "firefox",
      "firefox.desktop": "firefox",
      "com.microsoft.msedge": "edge",
      "com.microsoft.edge": "edge",
      "com.microsoft.edgemac": "edge",
      "microsoft-edge.desktop": "edge"
    };
    const flags = {
      chrome: "--incognito",
      brave: "--incognito",
      firefox: "--private-window",
      edge: "--inPrivate"
    };
    const browser = is_wsl_default ? await getWindowsDefaultBrowserFromWsl() : await defaultBrowser2();
    if (browser.id in ids) {
      const browserName = ids[browser.id];
      if (app === "browserPrivate") {
        appArguments.push(flags[browserName]);
      }
      return baseOpen({
        ...options,
        app: {
          name: apps[browserName],
          arguments: appArguments
        }
      });
    }
    throw new Error(`${browser.name} is not supported as a default browser`);
  }
  let command;
  const cliArguments = [];
  const childProcessOptions = {};
  if (platform === "darwin") {
    command = "open";
    if (options.wait) {
      cliArguments.push("--wait-apps");
    }
    if (options.background) {
      cliArguments.push("--background");
    }
    if (options.newInstance) {
      cliArguments.push("--new");
    }
    if (app) {
      cliArguments.push("-a", app);
    }
  } else if (platform === "win32" || is_wsl_default && !isInsideContainer() && !app) {
    command = await powerShellPath();
    cliArguments.push("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand");
    if (!is_wsl_default) {
      childProcessOptions.windowsVerbatimArguments = true;
    }
    const encodedArguments = ["Start"];
    if (options.wait) {
      encodedArguments.push("-Wait");
    }
    if (app) {
      encodedArguments.push(`"\`"${app}\`""`);
      if (options.target) {
        appArguments.push(options.target);
      }
    } else if (options.target) {
      encodedArguments.push(`"${options.target}"`);
    }
    if (appArguments.length > 0) {
      appArguments = appArguments.map((argument) => `"\`"${argument}\`""`);
      encodedArguments.push("-ArgumentList", appArguments.join(","));
    }
    options.target = Buffer.from(encodedArguments.join(" "), "utf16le").toString("base64");
  } else {
    if (app) {
      command = app;
    } else {
      const isBundled = !__dirname2 || __dirname2 === "/";
      let exeLocalXdgOpen = false;
      try {
        await fs5.access(localXdgOpenPath, fsConstants2.X_OK);
        exeLocalXdgOpen = true;
      } catch {}
      const useSystemXdgOpen = process7.versions.electron ?? (platform === "android" || isBundled || !exeLocalXdgOpen);
      command = useSystemXdgOpen ? "xdg-open" : localXdgOpenPath;
    }
    if (appArguments.length > 0) {
      cliArguments.push(...appArguments);
    }
    if (!options.wait) {
      childProcessOptions.stdio = "ignore";
      childProcessOptions.detached = true;
    }
  }
  if (platform === "darwin" && appArguments.length > 0) {
    cliArguments.push("--args", ...appArguments);
  }
  if (options.target) {
    cliArguments.push(options.target);
  }
  const subprocess = childProcess.spawn(command, cliArguments, childProcessOptions);
  if (options.wait) {
    return new Promise((resolve, reject) => {
      subprocess.once("error", reject);
      subprocess.once("close", (exitCode) => {
        if (!options.allowNonzeroExitCode && exitCode > 0) {
          reject(new Error(`Exited with code ${exitCode}`));
          return;
        }
        resolve(subprocess);
      });
    });
  }
  subprocess.unref();
  return subprocess;
};
var open = (target, options) => {
  if (typeof target !== "string") {
    throw new TypeError("Expected a `target`");
  }
  return baseOpen({
    ...options,
    target
  });
};
function detectArchBinary(binary) {
  if (typeof binary === "string" || Array.isArray(binary)) {
    return binary;
  }
  const { [arch]: archBinary } = binary;
  if (!archBinary) {
    throw new Error(`${arch} is not supported`);
  }
  return archBinary;
}
function detectPlatformBinary({ [platform]: platformBinary }, { wsl }) {
  if (wsl && is_wsl_default) {
    return detectArchBinary(wsl);
  }
  if (!platformBinary) {
    throw new Error(`${platform} is not supported`);
  }
  return detectArchBinary(platformBinary);
}
var apps = {};
defineLazyProperty(apps, "chrome", () => detectPlatformBinary({
  darwin: "google chrome",
  win32: "chrome",
  linux: ["google-chrome", "google-chrome-stable", "chromium"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    x64: ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
  }
}));
defineLazyProperty(apps, "brave", () => detectPlatformBinary({
  darwin: "brave browser",
  win32: "brave",
  linux: ["brave-browser", "brave"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
    x64: ["/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"]
  }
}));
defineLazyProperty(apps, "firefox", () => detectPlatformBinary({
  darwin: "firefox",
  win32: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
  linux: "firefox"
}, {
  wsl: "/mnt/c/Program Files/Mozilla Firefox/firefox.exe"
}));
defineLazyProperty(apps, "edge", () => detectPlatformBinary({
  darwin: "microsoft edge",
  win32: "msedge",
  linux: ["microsoft-edge", "microsoft-edge-dev"]
}, {
  wsl: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
}));
defineLazyProperty(apps, "browser", () => "browser");
defineLazyProperty(apps, "browserPrivate", () => "browserPrivate");
var open_default = open;

// ../web-preview/document.ts
function buildHtmlDocument(options) {
  const styleBlock = options.css ? `  <style>
${options.css}
  </style>
` : "";
  const scriptBlock = options.js ? `  <script>
${options.js}
  </script>
` : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${options.title}</title>
${styleBlock}</head>
<body>
${options.bodyHtml}
${scriptBlock}</body>
</html>`;
}
// ../web-preview/server.ts
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
var PREVIEW_DIR = join(tmpdir(), "pi-html-preview");
var DEFAULT_PORT = 3456;
var activeServer = null;
async function findAvailablePort(startPort, host, maxAttempts = 100) {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;
    function tryPort() {
      if (currentPort >= startPort + maxAttempts) {
        reject(new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`));
        return;
      }
      const testServer = createServer();
      testServer.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          currentPort++;
          tryPort();
        } else {
          reject(err);
        }
      });
      testServer.once("listening", () => {
        testServer.close(() => resolve(currentPort));
      });
      testServer.listen(currentPort, host);
    }
    tryPort();
  });
}
async function ensurePreviewServer(options) {
  if (activeServer) {
    return activeServer;
  }
  const port = await findAvailablePort(options.port ?? DEFAULT_PORT, options.host);
  const url = `http://${options.urlHost}:${port}`;
  const server = createServer((req, res) => {
    const urlPath = req.url;
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }
    if (urlPath === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Pi HTML Preview</h1><p>Use /html to generate previews.</p>");
      return;
    }
    if (urlPath.endsWith(".html")) {
      const fileName = urlPath.slice(1);
      const filePath = join(PREVIEW_DIR, fileName);
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      try {
        const content = readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
  await new Promise((resolve) => server.listen(port, options.host, resolve));
  activeServer = { port, url, server };
  return activeServer;
}
async function stopPreviewServer() {
  if (!activeServer)
    return;
  const { server } = activeServer;
  activeServer = null;
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
// config.ts
import { readFile } from "node:fs/promises";
var ACTIONS = ["allow", "ask", "deny"];
function createDefaultConfig() {
  return {
    defaultPolicy: "ask",
    judgeModel: "deepseek/deepseek-v4-flash",
    judgeTimeoutMs: 8000,
    childPolicy: "deny-on-unsafe",
    permission: {}
  };
}
function isAction(value) {
  return typeof value === "string" && ACTIONS.includes(value);
}
function isValidChildPolicy(value) {
  return value === "deny-on-unsafe" || value === "allow-on-safe";
}
function isValidPositiveNumber(value) {
  return typeof value === "number" && isFinite(value) && value >= 0;
}
async function loadConfig(configPath) {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(`[my-permission] invalid config at ${configPath}, using defaults`);
      return createDefaultConfig();
    }
    const p = parsed;
    const def = createDefaultConfig();
    return {
      defaultPolicy: isAction(p.defaultPolicy) ? p.defaultPolicy : def.defaultPolicy,
      judgeModel: typeof p.judgeModel === "string" ? p.judgeModel : def.judgeModel,
      judgeTimeoutMs: isValidPositiveNumber(p.judgeTimeoutMs) ? p.judgeTimeoutMs : def.judgeTimeoutMs,
      childPolicy: isValidChildPolicy(p.childPolicy) ? p.childPolicy : def.childPolicy,
      permission: p.permission && typeof p.permission === "object" && !Array.isArray(p.permission) ? p.permission : def.permission
    };
  } catch (error) {
    console.warn(`[my-permission] failed to load config at ${configPath}, using defaults: ${error}`);
    return createDefaultConfig();
  }
}

// judge.ts
import { complete } from "@earendil-works/pi-ai";
function createJudge(config, deps) {
  return async function judge(input, cwd, model, resolveModel) {
    const resolved = resolveJudgeModel(config, resolveModel, model);
    if (!resolved) {
      return failureResult("未找到可用的法官模型，请手动确认", input);
    }
    const auth = deps?.getAuth ? await deps.getAuth(resolved) : undefined;
    const prompt = buildJudgePrompt(input, cwd);
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [
        { role: "user", content: prompt, timestamp: Date.now() }
      ]
    };
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), config.judgeTimeoutMs);
    try {
      const response = await complete(resolved, context, {
        signal: controller.signal,
        apiKey: auth?.apiKey,
        headers: auth?.headers
      });
      clearTimeout(timeout);
      return parseJudgeResponse(response) ?? failureResult("法官模型返回格式不正确，请手动确认", input);
    } catch (error) {
      clearTimeout(timeout);
      console.warn("[my-permission] judge call failed:", error);
      if (controller.signal.aborted) {
        return failureResult(`法官模型调用超时（${config.judgeTimeoutMs}ms），请手动确认`, input);
      }
      return failureResult("法官模型调用失败，请手动确认", input);
    }
  };
}
function failureResult(reason, input) {
  return {
    safe: false,
    reason,
    toolFor: `${input.toolName} ${input.value}`
  };
}
function resolveJudgeModel(config, resolveModel, fallback) {
  const parts = config.judgeModel.split("/");
  if (parts.length !== 2)
    return fallback;
  const found = resolveModel(parts[0], parts[1]);
  if (found)
    return found;
  return fallback;
}
function buildJudgePrompt(input, cwd) {
  return `你是一名编码助手的安全门禁。评估以下工具调用是否可以自动执行。

当前工作目录：${cwd}
工具名：${input.toolName}
工具输入（已脱敏）：${JSON.stringify(input.value)}

只回复严格 JSON：
{
  "safe": boolean,
  "score": number, // 1-10，分数越高越安全
  "reason": "一句话说明为什么安全或不安全",
  "toolFor": "一句话说明该工具调用会做什么"
}

判断标准：
- 安全：只读操作、git status/diff/log、运行测试、构建项目、安装项目依赖等。
- 不安全：rm -rf、sudo、chmod/chown 777、写入密钥（.env、.pem、ssh 密钥）、无明确理由访问项目外文件、通过网络发送凭证、任意代码执行等。
- 保持简洁。不要包含 markdown 格式。`;
}
function parseJudgeResponse(response) {
  const text = response.content.find((c) => c.type === "text")?.text;
  if (!text)
    return;
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch)
    return;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== "object" || typeof parsed.safe !== "boolean" || typeof parsed.reason !== "string" || typeof parsed.toolFor !== "string") {
      return;
    }
    const score = parsed.score;
    if (typeof score !== "number" || score < 1 || score > 10) {
      return;
    }
    return { ...parsed, score };
  } catch {
    return;
  }
}

// log-page.ts
var PAGE_CSS = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #cdd6f4;
  background: #1e1e2e;
  margin: 0;
  padding: 0;
}
.page-header {
  padding: 1.5rem 1rem 1rem;
  text-align: center;
  border-bottom: 1px solid #313244;
}
.page-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #cba6f7;
  margin: 0 0 0.35rem;
}
.page-header p {
  color: #7f849c;
  font-size: 0.85rem;
  margin: 0 0 0.9rem;
}
.filters {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}
.filter-btn {
  background: #313244;
  border: 1px solid #45475a;
  color: #a6adc8;
  padding: 4px 16px;
  border-radius: 999px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.filter-btn:hover {
  background: #45475a;
}
.filter-btn.active {
  background: #cba6f7;
  border-color: #cba6f7;
  color: #1e1e2e;
  font-weight: 600;
}
main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #313244;
  border-radius: 8px;
  overflow: hidden;
}
th, td {
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #313244;
}
th {
  background: #313244;
  color: #cba6f7;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
tbody tr:last-child td {
  border-bottom: none;
}
tbody tr:nth-child(even) td {
  background: #232436;
}
tbody tr:hover td {
  background: #313244;
}
td.num {
  color: #7f849c;
  white-space: nowrap;
}
td.command code {
  background: #11111b;
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 2px 6px;
  color: #94e2d5;
  font-size: 0.85em;
  word-break: break-all;
  white-space: pre-wrap;
}
td.safe {
  color: #a6e3a1;
  font-weight: 600;
  white-space: nowrap;
}
td.unsafe {
  color: #f38ba8;
  font-weight: 600;
  white-space: nowrap;
}
.page-footer {
  text-align: center;
  padding: 1rem 1rem 2rem;
  font-size: 0.8rem;
  color: #7f849c;
  border-top: 1px solid #313244;
}`;
var FILTER_JS = `function filterLogs(filter) {
  var buttons = document.querySelectorAll('.filter-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].dataset.filter === filter);
  }
  var rows = document.querySelectorAll('tbody tr');
  for (var j = 0; j < rows.length; j++) {
    var safe = rows[j].dataset.safe;
    var show = filter === 'all' ||
      (filter === 'safe' && safe === 'true') ||
      (filter === 'unsafe' && safe === 'false');
    rows[j].style.display = show ? '' : 'none';
  }
}`;
function renderJudgeLogPage(logs) {
  const rows = logs.map((log, index) => renderRow(log, index + 1)).reverse().join(`
`);
  return buildHtmlDocument({
    title: "法官判断日志",
    bodyHtml: `  <header class="page-header">
    <h1>法官判断日志</h1>
    <p>当前会话法官判断（共 ${logs.length} 条）</p>
    <div class="filters">
      <button class="filter-btn active" data-filter="all" onclick="filterLogs('all')">全部</button>
      <button class="filter-btn" data-filter="safe" onclick="filterLogs('safe')">安全</button>
      <button class="filter-btn" data-filter="unsafe" onclick="filterLogs('unsafe')">不安全</button>
    </div>
  </header>
  <main>
    <table>
      <thead>
        <tr><th>#</th><th>工具</th><th>命令</th><th>判定</th><th>用途</th><th>理由</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </main>
  <footer class="page-footer">Generated by pi · my-permission</footer>`,
    css: PAGE_CSS,
    js: FILTER_JS
  });
}
function renderRow(log, num) {
  const verdictClass = log.safe ? "safe" : "unsafe";
  const verdictLabel = log.safe ? "✓ 安全" : "✗ 不安全";
  const scoreText = log.score !== undefined ? `（${log.score}/10）` : "";
  return `        <tr data-safe="${log.safe}">
          <td class="num">${num}</td>
          <td>${escapeHtml(log.toolName)}</td>
          <td class="command"><code>${escapeHtml(log.value)}</code></td>
          <td class="${verdictClass}">${verdictLabel}${scoreText}</td>
          <td>${escapeHtml(log.toolFor)}</td>
          <td>${escapeHtml(log.reason)}</td>
        </tr>`;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// utils.ts
import { homedir } from "node:os";
import { resolve } from "node:path";
function expandHome(path2) {
  if (path2 === "~" || path2.startsWith("~/")) {
    return path2.replace("~", homedir());
  }
  return path2;
}
function isExternalPath(path2, cwd) {
  const absolute = path2.startsWith("/") || path2.startsWith("~") ? resolve(expandHome(path2)) : resolve(cwd, path2);
  const cwdAbsolute = resolve(cwd);
  return !absolute.startsWith(cwdAbsolute + "/") && absolute !== cwdAbsolute;
}
function splitBashCommandUnits(command) {
  const units = [];
  let current = "";
  let inQuotes = false;
  for (const char of command) {
    if (inQuotes) {
      current += char;
      if (char === inQuotes)
        inQuotes = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inQuotes = char;
      current += char;
      continue;
    }
    if (char === "&" || char === "|" || char === ";" || char === `
`) {
      if (current.trim())
        units.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim())
    units.push(current.trim());
  return units;
}
function stripEnvPrefix(unit) {
  const match = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+(.*)$/s.exec(unit);
  return match ? match[1] : unit;
}
function extractPathTokens(command, _cwd) {
  const tokens = new Set;
  const words = command.split(/\s+/);
  for (const word of words) {
    const trimmed = word.replace(/^["']|["']$/g, "");
    if (trimmed.startsWith("/") || trimmed.startsWith("~/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
      tokens.add(trimmed);
    } else if (trimmed.includes("/")) {
      tokens.add(trimmed);
    } else if (trimmed.startsWith(".") && trimmed.length > 1) {
      tokens.add(trimmed);
    } else if (!trimmed.startsWith("-") && /^[a-zA-Z0-9._-]+$/.test(trimmed) && trimmed.length > 1) {
      tokens.add(trimmed);
    }
  }
  return Array.from(tokens);
}

// rules.ts
function decide(input, cwd, config) {
  const layers = [];
  if (input.paths.length > 0) {
    const pathRules = normalizeCrossCuttingRule(config.permission.path);
    if (pathRules) {
      layers.push(evaluatePathLayer(input.paths, pathRules, cwd));
    }
    const extRules = normalizeCrossCuttingRule(config.permission.external_directory);
    if (extRules) {
      layers.push(evaluateExternalDirectoryLayer(input.paths, extRules, cwd));
    }
  }
  const surfaceRules = config.permission[input.toolName];
  if (surfaceRules) {
    layers.push(evaluateSurfaceLayer(input, surfaceRules, cwd));
  }
  const merged = mergeVerdicts(...layers);
  if (merged)
    return merged;
  return { action: config.defaultPolicy, source: "defaultPolicy" };
}
function normalizeCrossCuttingRule(rule) {
  if (rule === undefined)
    return;
  if (typeof rule === "string")
    return { "*": rule };
  if (typeof rule === "object" && "action" in rule) {
    const dv = rule;
    return { "*": { action: dv.action, reason: dv.reason } };
  }
  return rule;
}
function evaluatePathLayer(paths, rules, _cwd) {
  return evaluateRuleMapMany(paths, rules, "path");
}
function evaluateExternalDirectoryLayer(paths, rules, cwd) {
  const externalPaths = paths.filter((p) => isExternalPath(p, cwd));
  if (externalPaths.length === 0)
    return;
  return evaluateRuleMapMany(externalPaths, rules, "external_directory");
}
function evaluateSurfaceLayer(input, rules, _cwd) {
  if (input.toolName === "bash" && typeof rules === "object" && !("action" in rules)) {
    const units = splitBashCommandUnits(input.value).map(stripEnvPrefix);
    const verdicts = units.map((unit) => evaluateRuleMap(unit, rules, "bash"));
    return mergeVerdicts(...verdicts) ?? { action: "ask", source: "bash" };
  }
  if (typeof rules === "string") {
    return { action: rules, source: input.toolName };
  }
  if (typeof rules === "object" && "action" in rules) {
    return toVerdict(rules, input.value, input.toolName);
  }
  return evaluateRuleMap(input.value, rules, input.toolName);
}
function evaluateRuleMapMany(values, rules, source) {
  const verdicts = values.map((v) => evaluateRuleMap(v, rules, source));
  return mergeVerdicts(...verdicts);
}
function evaluateRuleMap(value, rules, source) {
  let winner;
  for (const [pattern, rule] of Object.entries(rules)) {
    if (matchPattern(pattern, value)) {
      winner = toVerdict(rule, pattern, source);
    }
  }
  return winner;
}
function toVerdict(rule, matchedPattern, source) {
  if (typeof rule === "string") {
    return { action: rule, matchedPattern, source };
  }
  return {
    action: rule.action,
    reason: rule.reason,
    matchedPattern,
    source
  };
}
function matchPattern(pattern, value) {
  const expanded = expandHome(pattern);
  if (expanded === "*")
    return true;
  const regex = new RegExp("^" + expanded.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  return regex.test(value);
}
function mergeVerdicts(...verdicts) {
  const valid = verdicts.filter((v) => v !== undefined);
  if (valid.length === 0)
    return;
  const order = ["deny", "ask", "allow"];
  const sorted = [...valid].sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action));
  return sorted[0];
}

// stats.ts
var JUDGE_STATS_CUSTOM_TYPE = "my-permission-judge";
function recordJudgeStats(pi, input, result) {
  const entry = {
    decision: result.safe ? "allowed" : "denied",
    toolName: input.toolName,
    value: input.value,
    safe: result.safe,
    reason: result.reason,
    toolFor: result.toolFor
  };
  if (result.score !== undefined) {
    entry.score = result.score;
  }
  pi.appendEntry(JUDGE_STATS_CUSTOM_TYPE, entry);
}
function collectJudgeLogs(entries) {
  const logs = [];
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === JUDGE_STATS_CUSTOM_TYPE && entry.data && typeof entry.data === "object") {
      const data = entry.data;
      if (typeof data.toolName === "string" && typeof data.value === "string" && typeof data.safe === "boolean" && typeof data.reason === "string" && typeof data.toolFor === "string") {
        logs.push({
          decision: data.safe ? "allowed" : "denied",
          toolName: data.toolName,
          value: data.value,
          safe: data.safe,
          score: typeof data.score === "number" ? data.score : undefined,
          reason: data.reason,
          toolFor: data.toolFor
        });
      }
    }
  }
  return logs;
}

// ui.ts
var ANSI = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  cyan: "\x1B[36m"
};
function styled(text, ...codes) {
  return `${codes.join("")}${text}${ANSI.reset}`;
}
function label(text) {
  return styled(text, ANSI.bold);
}
function value(text) {
  return styled(text, ANSI.cyan);
}
function scoreStyle(score) {
  if (score <= 3)
    return ANSI.red;
  if (score <= 6)
    return ANSI.yellow;
  return ANSI.green;
}
function isChildSession() {
  return !!process.env.PI_SUBAGENT_PARENT_SESSION;
}
function createSessionCache() {
  const approved = new Set;
  return {
    approve(key) {
      approved.add(key);
    },
    isApproved(key) {
      return approved.has(key);
    }
  };
}
async function confirmToolCall(ctx, options) {
  if (!ctx.hasUI)
    return false;
  const { title, body } = formatConfirmMessage(options);
  return await ctx.ui.confirm(title, body);
}
function formatConfirmMessage(options) {
  const lines = [
    `${label("工具：")}${value(options.toolName)}`,
    `${label("操作：")}${styled(options.toolFor, ANSI.yellow)}`,
    `${label("输入：")}${value(options.value)}`,
    `${label("工作目录：")}${value(options.cwd)}`
  ];
  if (options.paths.length > 0) {
    lines.push(`${label("涉及路径：")}${value(options.paths.join(", "))}`);
  }
  const scoreText = options.score !== undefined ? styled(`（安全评分：${options.score}/10）`, scoreStyle(options.score), ANSI.bold) : "";
  lines.push(`${label("理由：")}${styled(options.reason, ANSI.bold)}${scoreText}`);
  return {
    title: `${label("确认工具调用：")}${styled(options.toolName, ANSI.bold, ANSI.cyan)}`,
    body: lines.join(`
`)
  };
}

// index.ts
async function myPermission(pi) {
  const extensionDir = dirname(fileURLToPath2(import.meta.url));
  const config = await loadConfig(join2(extensionDir, "config.json"));
  const cache = createSessionCache();
  const child = isChildSession();
  pi.registerCommand("judge-log", {
    description: "查看当前会话的每一次法官判断",
    handler: async (_args, ctx) => {
      const logs = collectJudgeLogs(ctx.sessionManager.getEntries());
      if (logs.length === 0) {
        ctx.ui.notify("当前会话暂无法官判断", "info");
        return;
      }
      try {
        const sessionId = ctx.sessionManager.getSessionId();
        const sessionDir = join2(PREVIEW_DIR, sessionId);
        mkdirSync(sessionDir, { recursive: true });
        writeFileSync(join2(sessionDir, "judge-log.html"), renderJudgeLogPage(logs), "utf-8");
        const server = await ensurePreviewServer({
          host: "127.0.0.1",
          urlHost: "localhost",
          port: 3456
        });
        const fileUrl = `${server.url}/${sessionId}/judge-log.html`;
        open_default(fileUrl).catch(() => {});
        ctx.ui.notify(`Preview: ${fileUrl}`, "info");
      } catch (err) {
        ctx.ui.notify(`Failed to start preview server: ${err.message}`, "error");
      }
    }
  });
  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });
  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
      getAuth: typeof ctx.modelRegistry.getApiKeyAndHeaders === "function" ? async (model) => {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        return auth.ok ? auth : undefined;
      } : undefined
    });
    const toolName = event.toolName;
    const value2 = stringifyToolInput(event);
    const rawPaths = collectPaths(toolName, value2, event, ctx.cwd);
    const paths = resolveSymlinkedPaths(rawPaths, ctx.cwd);
    const verdict = decide({ toolName, value: value2, paths }, ctx.cwd, config);
    if (verdict.action === "allow")
      return;
    if (verdict.action === "deny") {
      return {
        block: true,
        reason: verdict.reason ?? `Blocked by ${verdict.source}`
      };
    }
    const cacheKey = `${toolName}:${value2}`;
    if (cache.isApproved(cacheKey))
      return;
    const resolveModel = (provider, id) => ctx.modelRegistry.find(provider, id);
    const judgeResult = await judge({ toolName, value: value2, paths }, ctx.cwd, ctx.model, resolveModel);
    recordJudgeStats(pi, { toolName, value: value2 }, judgeResult);
    if (judgeResult.safe === true)
      return;
    if (child || !ctx.hasUI) {
      return {
        block: true,
        reason: judgeResult.reason
      };
    }
    const approved = await confirmToolCall(ctx, {
      toolName,
      toolFor: judgeResult.toolFor,
      reason: judgeResult.reason,
      score: judgeResult.score,
      value: value2,
      cwd: ctx.cwd,
      paths
    });
    if (approved) {
      cache.approve(cacheKey);
      return;
    }
    return { block: true, reason: `User denied: ${judgeResult.reason}` };
  });
}
function stringifyToolInput(event) {
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    return event.input.command;
  }
  if ((event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") && typeof event.input.path === "string") {
    return event.input.path;
  }
  return JSON.stringify(event.input);
}
function collectPaths(toolName, value2, event, cwd) {
  if (toolName === "bash")
    return extractPathTokens(value2, cwd);
  if (toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "ls") {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  if (toolName === "grep" || toolName === "find") {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  return [];
}
function resolveSymlinkedPaths(paths, cwd) {
  const resolved = [...paths];
  for (const p of paths) {
    try {
      const full = p.startsWith("/") || p.startsWith("~") ? join2(p.startsWith("~") ? process.env.HOME ?? "/home" : "/", p.replace(/^~/, "")) : join2(cwd, p);
      const real = realpathSync(full);
      if (real !== full) {
        resolved.push(real);
      }
    } catch {}
  }
  return resolved;
}
export {
  myPermission as default
};
