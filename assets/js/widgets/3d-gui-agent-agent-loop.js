/* 3D GUI Agent post 02: step through a GUI agent's episodes on a toy phone.
   Episode mode: each step shows the observation the agent receives (screenshot, Set-of-Mark labels or
   the accessibility tree), a one-line thought, and the action drawn on the screen; the next step shows
   the resulting screen. Episode 2 contains a grounding slip, a reflection step that recovers, and a
   confirmation request. Grounding mode: tap the phone to place a predicted point; the widget shows
   which element it hits and, for a Gaussian grounding error of sigma px, how often samples still hit it.
   Plain JS + Canvas 2D, no dependencies, ASCII only. Scripted and deterministic (a teaching tool). */
(function () {
  "use strict";
  var NAME = "3d-gui-agent-agent-loop";
  var PW = 360, PH = 680, M = 8;            // phone logical size (dp) and bezel margin

  var TXT = {
    en: {
      ep: ["Turn on Wi-Fi", "Send the latest photo to Mei", "Set an alarm for 7:30"],
      epShort: ["Wi-Fi", "Photo to Mei", "Alarm 7:30"],
      modeEp: "Episode", modeGr: "Grounding",
      obs: ["Screenshot", "Set-of-Mark", "A11y tree"],
      prev: "\u25c0 Prev", next: "Next \u25b6", reset: "Reset",
      instr: "Instruction", step: "Step", observation: "Observation", thought: "Thought", action: "Action",
      kinds: { act: "act", error: "slip", reflect: "reflection", ask: "ask user", done: "done" },
      obsShot: "Screenshot only (360 x 680 px). Toolbar icons have no text; the model must find targets in pixels.",
      obsSom: function (n) { return "Screenshot + " + n + " numbered marks on clickable elements; the model answers with a mark number."; },
      obsTree: "Accessibility tree (text, no pixels):",
      user: "User", yes: "Yes", agentAsks: "Agent asks",
      grHint: "Tap or drag on the phone to place the model's predicted point. The slider sets the grounding error (Gaussian, sigma in px); the dots are 400 samples. Use Prev / Next to pick a screen (try the photo toolbar, step 3 of the photo episode).",
      grHit: "Predicted point", hits: "hits", nothing: "nothing (empty space)",
      margin: "distance to that element's nearest edge", sigma: "error sigma",
      sameEl: "of samples hit the same element", other: "other elements", none: "empty space"
    },
    zh: {
      ep: ["\u6253\u5f00 Wi-Fi", "\u628a\u6700\u65b0\u7684\u7167\u7247\u53d1\u7ed9 Mei", "\u8bbe\u7f6e 7:30 \u7684\u95f9\u949f"],
      epShort: ["Wi-Fi", "\u7167\u7247\u53d1\u7ed9 Mei", "\u95f9\u949f 7:30"],
      modeEp: "\u56de\u5408", modeGr: "\u5b9a\u4f4d",
      obs: ["\u622a\u56fe", "Set-of-Mark", "\u65e0\u969c\u788d\u6811"],
      prev: "\u25c0 \u4e0a\u4e00\u6b65", next: "\u4e0b\u4e00\u6b65 \u25b6", reset: "\u91cd\u7f6e",
      instr: "\u6307\u4ee4", step: "\u7b2c", observation: "\u89c2\u6d4b", thought: "\u601d\u8003", action: "\u52a8\u4f5c",
      kinds: { act: "\u6267\u884c", error: "\u5931\u8bef", reflect: "\u53cd\u601d", ask: "\u8be2\u95ee\u7528\u6237", done: "\u5b8c\u6210" },
      obsShot: "\u4ec5\u622a\u56fe\uff08360 x 680 px\uff09\u3002\u5de5\u5177\u680f\u56fe\u6807\u6ca1\u6709\u6587\u5b57\uff0c\u6a21\u578b\u5fc5\u987b\u4ece\u50cf\u7d20\u4e2d\u627e\u5230\u76ee\u6807\u3002",
      obsSom: function (n) { return "\u622a\u56fe + " + n + " \u4e2a\u7f16\u53f7\u6807\u8bb0\uff08\u6807\u5728\u53ef\u70b9\u51fb\u5143\u7d20\u4e0a\uff09\uff0c\u6a21\u578b\u7528\u7f16\u53f7\u4f5c\u7b54\u3002"; },
      obsTree: "\u65e0\u969c\u788d\u6811\uff08\u6587\u672c\uff0c\u65e0\u50cf\u7d20\uff09\uff1a",
      user: "\u7528\u6237", yes: "\u662f", agentAsks: "\u667a\u80fd\u4f53\u8be2\u95ee",
      grHint: "\u5728\u624b\u673a\u4e0a\u70b9\u51fb\u6216\u62d6\u52a8\uff0c\u653e\u7f6e\u6a21\u578b\u9884\u6d4b\u7684\u70b9\u3002\u6ed1\u5757\u8bbe\u7f6e\u5b9a\u4f4d\u8bef\u5dee\uff08\u9ad8\u65af\u5206\u5e03\uff0csigma \u4ee5\u50cf\u7d20\u8ba1\uff09\uff0c\u5706\u70b9\u662f 400 \u4e2a\u6837\u672c\u3002\u7528\u4e0a\u4e00\u6b65 / \u4e0b\u4e00\u6b65\u9009\u62e9\u754c\u9762\uff08\u8bd5\u8bd5\u7167\u7247\u56de\u5408\u7b2c 3 \u6b65\u7684\u5de5\u5177\u680f\uff09\u3002",
      grHit: "\u9884\u6d4b\u70b9", hits: "\u547d\u4e2d", nothing: "\u7a7a\u767d\u5904\uff08\u672a\u547d\u4e2d\u4efb\u4f55\u5143\u7d20\uff09",
      margin: "\u5230\u8be5\u5143\u7d20\u6700\u8fd1\u8fb9\u7f18\u7684\u8ddd\u79bb", sigma: "\u8bef\u5dee sigma",
      sameEl: "\u7684\u6837\u672c\u547d\u4e2d\u540c\u4e00\u5143\u7d20", other: "\u5176\u4ed6\u5143\u7d20", none: "\u7a7a\u767d\u5904"
    },
    ja: {
      ep: ["Wi-Fi \u3092\u30aa\u30f3\u306b\u3059\u308b", "\u6700\u65b0\u306e\u5199\u771f\u3092 Mei \u306b\u9001\u308b", "7:30 \u306b\u30a2\u30e9\u30fc\u30e0\u3092\u8a2d\u5b9a\u3059\u308b"],
      epShort: ["Wi-Fi", "\u5199\u771f\u3092 Mei \u306b", "\u30a2\u30e9\u30fc\u30e0 7:30"],
      modeEp: "\u30a8\u30d4\u30bd\u30fc\u30c9", modeGr: "\u30b0\u30e9\u30a6\u30f3\u30c7\u30a3\u30f3\u30b0",
      obs: ["\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8", "Set-of-Mark", "A11y \u30c4\u30ea\u30fc"],
      prev: "\u25c0 \u524d\u3078", next: "\u6b21\u3078 \u25b6", reset: "\u30ea\u30bb\u30c3\u30c8",
      instr: "\u6307\u793a", step: "\u30b9\u30c6\u30c3\u30d7", observation: "\u89b3\u6e2c", thought: "\u601d\u8003", action: "\u884c\u52d5",
      kinds: { act: "\u5b9f\u884c", error: "\u30df\u30b9", reflect: "\u632f\u308a\u8fd4\u308a", ask: "\u30e6\u30fc\u30b6\u30fc\u306b\u78ba\u8a8d", done: "\u5b8c\u4e86" },
      obsShot: "\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u306e\u307f\uff08360 x 680 px\uff09\u3002\u30c4\u30fc\u30eb\u30d0\u30fc\u306e\u30a2\u30a4\u30b3\u30f3\u306b\u306f\u6587\u5b57\u304c\u306a\u304f\u3001\u30e2\u30c7\u30eb\u306f\u753b\u7d20\u304b\u3089\u5bfe\u8c61\u3092\u63a2\u3059\u5fc5\u8981\u304c\u3042\u308a\u307e\u3059\u3002",
      obsSom: function (n) { return "\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8 + \u30af\u30ea\u30c3\u30af\u53ef\u80fd\u306a\u8981\u7d20\u306b\u4ed8\u3051\u305f " + n + " \u500b\u306e\u756a\u53f7\u3002\u30e2\u30c7\u30eb\u306f\u756a\u53f7\u3067\u7b54\u3048\u307e\u3059\u3002"; },
      obsTree: "\u30a2\u30af\u30bb\u30b7\u30d3\u30ea\u30c6\u30a3\u30c4\u30ea\u30fc\uff08\u30c6\u30ad\u30b9\u30c8\u306e\u307f\u3001\u753b\u7d20\u306a\u3057\uff09\uff1a",
      user: "\u30e6\u30fc\u30b6\u30fc", yes: "\u306f\u3044", agentAsks: "\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306e\u8cea\u554f",
      grHint: "\u30b9\u30de\u30db\u306e\u753b\u9762\u3092\u30bf\u30c3\u30d7\u307e\u305f\u306f\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u3001\u30e2\u30c7\u30eb\u306e\u4e88\u6e2c\u70b9\u3092\u7f6e\u304d\u307e\u3059\u3002\u30b9\u30e9\u30a4\u30c0\u30fc\u306f\u30b0\u30e9\u30a6\u30f3\u30c7\u30a3\u30f3\u30b0\u8aa4\u5dee\uff08\u30ac\u30a6\u30b9\u5206\u5e03\u3001sigma \u306f px\uff09\u3067\u3001\u70b9\u306f 400 \u500b\u306e\u30b5\u30f3\u30d7\u30eb\u3067\u3059\u3002\u524d\u3078 / \u6b21\u3078\u3067\u753b\u9762\u3092\u9078\u3079\u307e\u3059\uff08\u5199\u771f\u30a8\u30d4\u30bd\u30fc\u30c9\u306e\u30b9\u30c6\u30c3\u30d7 3 \u306e\u30c4\u30fc\u30eb\u30d0\u30fc\u304c\u304a\u3059\u3059\u3081\uff09\u3002",
      grHit: "\u4e88\u6e2c\u70b9", hits: "\u304c\u5f53\u305f\u3063\u305f\u8981\u7d20", nothing: "\u306a\u3057\uff08\u7a7a\u767d\uff09",
      margin: "\u305d\u306e\u8981\u7d20\u306e\u6700\u3082\u8fd1\u3044\u8fba\u307e\u3067\u306e\u8ddd\u96e2", sigma: "\u8aa4\u5dee sigma",
      sameEl: "\u306e\u30b5\u30f3\u30d7\u30eb\u304c\u540c\u3058\u8981\u7d20\u306b\u5f53\u305f\u308b", other: "\u4ed6\u306e\u8981\u7d20", none: "\u7a7a\u767d"
    }
  };

  // ------------------------------------------------------------------------------------------
  // Screens: lists of elements {id, role, label, desc, x, y, w, h, click, ...}
  // ------------------------------------------------------------------------------------------
  function E(o) { return o; }
  var APPS = [["settings", "Settings", "#6b6b6b", "S"], ["clock", "Clock", "#1f77b4", "C"], ["gallery", "Gallery", "#ff7f0e", "G"],
    ["messages", "Messages", "#2ca02c", "M"], ["camera", "Camera", "#444444", "Ca"], ["maps", "Maps", "#17becf", "Ma"],
    ["browser", "Browser", "#9467bd", "B"], ["mail", "Mail", "#d62728", "@"]];
  function home() {
    var l = [];
    APPS.forEach(function (a, i) {
      l.push(E({ id: a[0], role: "appicon", label: a[1], color: a[2], glyph: a[3], x: 24 + (i % 4) * 84, y: 76 + Math.floor(i / 4) * 112, w: 64, h: 64, click: true }));
    });
    l.push(E({ id: "websearch", role: "search", label: "Search apps and web", x: 20, y: 560, w: 320, h: 46, click: true }));
    return l;
  }
  function header(title, back, backDesc) {
    var l = [E({ id: "title", role: "title", label: title, x: 0, y: 24, w: 360, h: 56, tx: back ? 60 : 18 })];
    if (back) l.push(E({ id: "up", role: "iconbtn", glyph: "back", desc: backDesc || "Navigate up", x: 8, y: 30, w: 44, h: 44, click: true }));
    return l;
  }
  function settings(on) {
    var l = header("Settings", true);
    l.push(E({ id: "ssearch", role: "search", label: "Search settings", x: 16, y: 92, w: 328, h: 40, click: true }));
    l.push(E({ id: "wifi", role: "switchrow", label: "Wi-Fi", sub: on ? "HomeNet" : "", on: on, x: 16, y: 146, w: 328, h: 52, click: true }));
    l.push(E({ id: "bt", role: "switchrow", label: "Bluetooth", on: true, x: 16, y: 204, w: 328, h: 52, click: true }));
    ["Display", "Sound", "Battery", "Notifications", "Apps"].forEach(function (t, i) {
      l.push(E({ id: t.toLowerCase(), role: "row", label: t, x: 16, y: 262 + 58 * i, w: 328, h: 52, click: true }));
    });
    return l;
  }
  var PAL = [["#7ec8f0", "#f2d27a", "#ffcc33"], ["#9ad19a", "#4f8f4f", "#ffffff"], ["#f6b0a0", "#b5655a", "#fff2b0"],
    ["#c9c3ee", "#6d63b8", "#ffffff"], ["#b8e0e8", "#3b8ea5", "#f7f7f7"], ["#ffd7a8", "#d98c3f", "#fff8e0"],
    ["#d9d9d9", "#8a8a8a", "#ffffff"], ["#a8d8b9", "#2f7d5b", "#e8ffef"], ["#f0c4dd", "#a35c86", "#ffffff"]];
  var SCENES = ["beach, today 09:12", "park, yesterday", "sunset, Nov 20", "city, Nov 18", "lake, Nov 15", "desert, Nov 10",
    "street, Nov 9", "forest, Nov 2", "flowers, Oct 30"];
  function gallery() {
    var l = header("Gallery", true);
    for (var i = 0; i < 9; i++) {
      l.push(E({ id: "photo" + i, role: "tile", pal: PAL[i], desc: "Photo, " + SCENES[i], x: 12 + (i % 3) * 114, y: 92 + Math.floor(i / 3) * 114, w: 108, h: 108, click: true }));
    }
    return l;
  }
  function photoView() {
    var l = header("IMG_0412", true);
    l.push(E({ id: "image", role: "image", pal: PAL[0], x: 0, y: 84, w: 360, h: 448 }));
    [["share", "share", "Share", 48], ["edit", "edit", "Edit", 104], ["fav", "star", "Favorite", 160], ["info", "info", "Details", 216], ["del", "trash", "Delete", 288]]
      .forEach(function (b) { l.push(E({ id: b[0], role: "iconbtn", glyph: b[1], desc: b[2], x: b[3], y: 560, w: 44, h: 44, click: true })); });
    return l;
  }
  function editor() {
    var l = [E({ id: "title", role: "title", label: "Edit", x: 0, y: 24, w: 360, h: 56, tx: 150 })];
    l.push(E({ id: "cancel", role: "textbtn", label: "Cancel", x: 6, y: 34, w: 76, h: 36, click: true }));
    l.push(E({ id: "save", role: "textbtn", label: "Save", x: 290, y: 34, w: 64, h: 36, click: true }));
    l.push(E({ id: "image", role: "image", pal: PAL[0], crop: true, x: 24, y: 104, w: 312, h: 400 }));
    [["crop", "crop", "Crop", 58], ["adjust", "sliders", "Adjust", 158], ["filter", "filter", "Filters", 258]]
      .forEach(function (b) { l.push(E({ id: b[0], role: "iconbtn", glyph: b[1], desc: b[2], x: b[3], y: 556, w: 44, h: 44, click: true })); });
    return l;
  }
  function shareSheet() {
    var l = photoView().map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; c.click = false; c.hidden = true; return c; });
    l.push(E({ id: "dim", role: "dim", x: 0, y: 24, w: 360, h: 616 }));
    l.push(E({ id: "sheet", role: "sheet", label: "Share with", x: 0, y: 330, w: 360, h: 310 }));
    [["mei", "Mei", "#e377c2"], ["ken", "Ken", "#1f77b4"], ["aya", "Aya", "#2ca02c"], ["more", "More", "#999999"]].forEach(function (c, i) {
      l.push(E({ id: c[0], role: "avatar", label: c[1], color: c[2], x: 16 + i * 84, y: 374, w: 76, h: 88, click: true }));
    });
    [["smsapp", "Messages", "#2ca02c"], ["mailapp", "Mail", "#d62728"], ["copy", "Copy link", "#7f7f7f"], ["nearby", "Nearby", "#17becf"]].forEach(function (c, i) {
      l.push(E({ id: c[0], role: "appchip", label: c[1], color: c[2], x: 16 + i * 84, y: 480, w: 76, h: 88, click: true }));
    });
    return l;
  }
  function compose(sent) {
    var l = header("Mei", true);
    l.push(E({ id: "today", role: "text", label: "Today", x: 150, y: 100, w: 60, h: 20 }));
    if (sent) l.push(E({ id: "bubble", role: "bubble", pal: PAL[0], desc: "Photo, sent, delivered", x: 150, y: 330, w: 198, h: 180 }));
    l.push(E({ id: "msg", role: "msginput", label: "Add a message", attach: !sent, x: 12, y: 572, w: 280, h: 52, click: true }));
    l.push(E({ id: "send", role: "iconbtn", glyph: "send", desc: "Send", x: 300, y: 574, w: 48, h: 48, click: true }));
    return l;
  }
  function clock(withNew) {
    var l = header("Clock", false);
    [["tabA", "Alarm", 0], ["tabW", "World", 120], ["tabT", "Timer", 240]].forEach(function (t) {
      l.push(E({ id: t[0], role: "tab", label: t[1], sel: t[0] === "tabA", x: t[2], y: 80, w: 120, h: 44, click: true }));
    });
    var rows = [["a630", "6:30 AM", "Weekdays", false], ["a800", "8:00 AM", "Sat, Sun", true]];
    if (withNew) rows.push(["a730", "7:30 AM", "Once", true]);
    rows.forEach(function (r, i) {
      l.push(E({ id: r[0], role: "alarmrow", label: r[1], sub: r[2], on: r[3], x: 12, y: 140 + 86 * i, w: 336, h: 76, click: true }));
    });
    l.push(E({ id: "fab", role: "fab", desc: "Add alarm", x: 150, y: 548, w: 60, h: 60, click: true }));
    return l;
  }
  function newAlarm(h, m) {
    var l = header("New alarm", true, "Cancel");
    l.push(E({ id: "hour", role: "field", label: "Hour", value: h, x: 24, y: 112, w: 144, h: 76, click: true }));
    l.push(E({ id: "minute", role: "field", label: "Minute", value: m, x: 192, y: 112, w: 144, h: 76, click: true }));
    l.push(E({ id: "am", role: "seg", label: "AM", sel: true, x: 24, y: 214, w: 156, h: 46, click: true }));
    l.push(E({ id: "pm", role: "seg", label: "PM", sel: false, x: 180, y: 214, w: 156, h: 46, click: true }));
    l.push(E({ id: "alabel", role: "field", label: "Label", value: "", ph: "Alarm", x: 24, y: 290, w: 312, h: 76, click: true }));
    l.push(E({ id: "savebtn", role: "bigbtn", label: "Save", x: 24, y: 560, w: 312, h: 52, click: true }));
    return l;
  }
  var SCREENS = {
    home: home(), settings: settings(false), settingsOn: settings(true), gallery: gallery(), photo: photoView(),
    editor: editor(), share: shareSheet(), compose: compose(false), sent: compose(true), clock: clock(false),
    alarmNew: newAlarm("", ""), alarmH: newAlarm("7", ""), alarmHM: newAlarm("7", "30"), clockDone: clock(true)
  };
  function find(scr, id) { var l = SCREENS[scr]; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function center(e) { return [e.x + e.w / 2, e.y + e.h / 2]; }

  // ------------------------------------------------------------------------------------------
  // Episodes. t = [en, zh, ja]; a = action {type, target, text, pt}; k = kind
  // ------------------------------------------------------------------------------------------
  var EPISODES = [
    [
      { s: "home", k: "act", a: { type: "tap", target: "settings" }, t: ["Wi-Fi is a system setting, so open the Settings app.", "Wi-Fi \u5c5e\u4e8e\u7cfb\u7edf\u8bbe\u7f6e\uff0c\u5148\u6253\u5f00 Settings\uff08\u8bbe\u7f6e\uff09\u5e94\u7528\u3002", "Wi-Fi \u306f\u30b7\u30b9\u30c6\u30e0\u8a2d\u5b9a\u306a\u306e\u3067\u3001Settings\uff08\u8a2d\u5b9a\uff09\u30a2\u30d7\u30ea\u3092\u958b\u304d\u307e\u3059\u3002"] },
      { s: "settings", k: "act", a: { type: "tap", target: "wifi", pt: [318, 172] }, t: ["The Wi-Fi switch is off. Tap the switch.", "Wi-Fi \u5f00\u5173\u662f\u5173\u7740\u7684\uff0c\u70b9\u51fb\u8fd9\u4e2a\u5f00\u5173\u3002", "Wi-Fi \u306e\u30b9\u30a4\u30c3\u30c1\u304c\u30aa\u30d5\u3067\u3059\u3002\u30b9\u30a4\u30c3\u30c1\u3092\u30bf\u30c3\u30d7\u3057\u307e\u3059\u3002"] },
      { s: "settingsOn", k: "done", a: { type: "finish" }, t: ["Verify: the switch is on and a network name appears. The task is done.", "\u9a8c\u8bc1\uff1a\u5f00\u5173\u5df2\u6253\u5f00\uff0c\u5e76\u663e\u793a\u4e86\u7f51\u7edc\u540d\u79f0\u3002\u4efb\u52a1\u5b8c\u6210\u3002", "\u78ba\u8a8d\uff1a\u30b9\u30a4\u30c3\u30c1\u304c\u30aa\u30f3\u306b\u306a\u308a\u3001\u30cd\u30c3\u30c8\u30ef\u30fc\u30af\u540d\u304c\u8868\u793a\u3055\u308c\u3066\u3044\u307e\u3059\u3002\u30bf\u30b9\u30af\u5b8c\u4e86\u3067\u3059\u3002"] }
    ],
    [
      { s: "home", k: "act", a: { type: "tap", target: "gallery" }, t: ["The photo is in the gallery: open Gallery.", "\u7167\u7247\u5728\u56fe\u5e93\u91cc\uff1a\u6253\u5f00 Gallery\uff08\u56fe\u5e93\uff09\u3002", "\u5199\u771f\u306f\u30ae\u30e3\u30e9\u30ea\u30fc\u306b\u3042\u308a\u307e\u3059\u3002Gallery \u3092\u958b\u304d\u307e\u3059\u3002"] },
      { s: "gallery", k: "act", a: { type: "tap", target: "photo0" }, t: ["The newest photo is the first tile. Open it.", "\u6700\u65b0\u7684\u7167\u7247\u662f\u7b2c\u4e00\u5f20\u7f29\u7565\u56fe\uff0c\u6253\u5f00\u5b83\u3002", "\u6700\u65b0\u306e\u5199\u771f\u306f\u6700\u521d\u306e\u30b5\u30e0\u30cd\u30a4\u30eb\u3067\u3059\u3002\u958b\u304d\u307e\u3059\u3002"] },
      { s: "photo", k: "error", a: { type: "tap", target: "edit", pt: [107, 581] }, t: ["Tap the Share icon, the first icon of the bottom toolbar.", "\u70b9\u51fb\u5e95\u90e8\u5de5\u5177\u680f\u7684\u7b2c\u4e00\u4e2a\u56fe\u6807\uff1a\u5206\u4eab\uff08Share\uff09\u3002", "\u4e0b\u90e8\u30c4\u30fc\u30eb\u30d0\u30fc\u306e\u6700\u521d\u306e\u30a2\u30a4\u30b3\u30f3\u3001\u5171\u6709\uff08Share\uff09\u3092\u30bf\u30c3\u30d7\u3057\u307e\u3059\u3002"],
        note: ["With the accessibility tree this slip is unlikely: the node is labelled \"Share\". Small unlabeled icons are where pixel-only grounding misses.",
          "\u5982\u679c\u4f7f\u7528\u65e0\u969c\u788d\u6811\uff0c\u8fd9\u4e2a\u5931\u8bef\u4e0d\u592a\u4f1a\u53d1\u751f\uff1a\u8282\u70b9\u76f4\u63a5\u6807\u7740 \"Share\"\u3002\u50cf\u7d20\u7ea7\u5b9a\u4f4d\u6700\u5bb9\u6613\u5728\u6ca1\u6709\u6587\u5b57\u7684\u5c0f\u56fe\u6807\u4e0a\u51fa\u9519\u3002",
          "\u30a2\u30af\u30bb\u30b7\u30d3\u30ea\u30c6\u30a3\u30c4\u30ea\u30fc\u306a\u3089\u3053\u306e\u30df\u30b9\u306f\u8d77\u304d\u306b\u304f\u3044\u3067\u3059\u3002\u30ce\u30fc\u30c9\u306b \"Share\" \u3068\u66f8\u304b\u308c\u3066\u3044\u308b\u304b\u3089\u3067\u3059\u3002\u753b\u7d20\u3060\u3051\u306e\u30b0\u30e9\u30a6\u30f3\u30c7\u30a3\u30f3\u30b0\u306f\u3001\u6587\u5b57\u306e\u306a\u3044\u5c0f\u3055\u306a\u30a2\u30a4\u30b3\u30f3\u3067\u5916\u308c\u3084\u3059\u304f\u306a\u308a\u307e\u3059\u3002"] },
      { s: "editor", k: "reflect", a: { type: "back" }, t: ["Reflection: this is the photo editor, not a share sheet. My tap landed on Edit, 15 px right of Share. Undo with Back.", "\u53cd\u601d\uff1a\u8fd9\u662f\u7167\u7247\u7f16\u8f91\u5668\uff0c\u4e0d\u662f\u5206\u4eab\u9762\u677f\u3002\u4e0a\u4e00\u6b65\u70b9\u5230\u4e86\u201c\u7f16\u8f91\u201d\uff0c\u5728\u201c\u5206\u4eab\u201d\u53f3\u8fb9 15 \u50cf\u7d20\u5904\u3002\u7528\u8fd4\u56de\u952e\u64a4\u9500\u3002", "\u632f\u308a\u8fd4\u308a\uff1a\u3053\u308c\u306f\u5199\u771f\u30a8\u30c7\u30a3\u30bf\u3067\u3001\u5171\u6709\u30b7\u30fc\u30c8\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002\u524d\u306e\u30bf\u30c3\u30d7\u306f\u5171\u6709\u306e 15 px \u53f3\u306b\u3042\u308b\u7de8\u96c6\u306b\u5f53\u305f\u308a\u307e\u3057\u305f\u3002\u623b\u308b\u3067\u53d6\u308a\u6d88\u3057\u307e\u3059\u3002"] },
      { s: "photo", k: "act", a: { type: "tap", target: "share" }, t: ["Back on the photo. Tap Share again, aiming at the centre of the icon.", "\u56de\u5230\u7167\u7247\u9875\u3002\u518d\u6b21\u70b9\u51fb\u201c\u5206\u4eab\u201d\uff0c\u8fd9\u6b21\u7784\u51c6\u56fe\u6807\u4e2d\u5fc3\u3002", "\u5199\u771f\u306b\u623b\u308a\u307e\u3057\u305f\u3002\u4eca\u5ea6\u306f\u30a2\u30a4\u30b3\u30f3\u306e\u4e2d\u5fc3\u3092\u72d9\u3063\u3066\u3001\u3082\u3046\u4e00\u5ea6\u5171\u6709\u3092\u30bf\u30c3\u30d7\u3057\u307e\u3059\u3002"] },
      { s: "share", k: "act", a: { type: "tap", target: "mei" }, t: ["The share sheet lists Mei as a contact. Tap Mei.", "\u5206\u4eab\u9762\u677f\u7684\u8054\u7cfb\u4eba\u91cc\u6709 Mei\uff0c\u70b9\u51fb Mei\u3002", "\u5171\u6709\u30b7\u30fc\u30c8\u306e\u9023\u7d61\u5148\u306b Mei \u304c\u3044\u307e\u3059\u3002Mei \u3092\u30bf\u30c3\u30d7\u3057\u307e\u3059\u3002"] },
      { s: "compose", k: "ask", a: { type: "ask", text: ["Send this photo to Mei?", "\u8981\u628a\u8fd9\u5f20\u7167\u7247\u53d1\u7ed9 Mei \u5417\uff1f", "\u3053\u306e\u5199\u771f\u3092 Mei \u306b\u9001\u308a\u307e\u3059\u304b\uff1f"] }, t: ["Sending a message to another person is consequential, so ask the user first.", "\u7ed9\u522b\u4eba\u53d1\u6d88\u606f\u662f\u6709\u540e\u679c\u7684\u64cd\u4f5c\uff0c\u5148\u8bf7\u7528\u6237\u786e\u8ba4\u3002", "\u4ed6\u4eba\u3078\u306e\u30e1\u30c3\u30bb\u30fc\u30b8\u9001\u4fe1\u306f\u53d6\u308a\u6d88\u3057\u306b\u304f\u3044\u64cd\u4f5c\u306a\u306e\u3067\u3001\u5148\u306b\u30e6\u30fc\u30b6\u30fc\u306b\u78ba\u8a8d\u3057\u307e\u3059\u3002"] },
      { s: "compose", k: "act", a: { type: "tap", target: "send" }, t: ["The user confirmed. Tap Send.", "\u7528\u6237\u5df2\u786e\u8ba4\uff0c\u70b9\u51fb\u53d1\u9001\u3002", "\u30e6\u30fc\u30b6\u30fc\u304c\u627f\u8a8d\u3057\u307e\u3057\u305f\u3002\u9001\u4fe1\u3092\u30bf\u30c3\u30d7\u3057\u307e\u3059\u3002"] },
      { s: "sent", k: "done", a: { type: "finish" }, t: ["Verify: the photo appears in the chat as delivered. The task is done.", "\u9a8c\u8bc1\uff1a\u7167\u7247\u5df2\u51fa\u73b0\u5728\u5bf9\u8bdd\u4e2d\u5e76\u663e\u793a\u5df2\u9001\u8fbe\u3002\u4efb\u52a1\u5b8c\u6210\u3002", "\u78ba\u8a8d\uff1a\u5199\u771f\u304c\u30c1\u30e3\u30c3\u30c8\u306b\u914d\u4fe1\u6e08\u307f\u3068\u3057\u3066\u8868\u793a\u3055\u308c\u3066\u3044\u307e\u3059\u3002\u30bf\u30b9\u30af\u5b8c\u4e86\u3067\u3059\u3002"] }
    ],
    [
      { s: "home", k: "act", a: { type: "tap", target: "clock" }, t: ["Alarms are in the Clock app. Open Clock.", "\u95f9\u949f\u5728 Clock\uff08\u65f6\u949f\uff09\u5e94\u7528\u91cc\uff0c\u6253\u5f00\u5b83\u3002", "\u30a2\u30e9\u30fc\u30e0\u306f Clock\uff08\u6642\u8a08\uff09\u30a2\u30d7\u30ea\u306b\u3042\u308a\u307e\u3059\u3002\u958b\u304d\u307e\u3059\u3002"] },
      { s: "clock", k: "act", a: { type: "tap", target: "fab" }, t: ["There is no 7:30 alarm yet. Tap + to add one.", "\u8fd8\u6ca1\u6709 7:30 \u7684\u95f9\u949f\u3002\u70b9\u51fb + \u65b0\u5efa\u4e00\u4e2a\u3002", "7:30 \u306e\u30a2\u30e9\u30fc\u30e0\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002+ \u3092\u30bf\u30c3\u30d7\u3057\u3066\u8ffd\u52a0\u3057\u307e\u3059\u3002"] },
      { s: "alarmNew", k: "act", a: { type: "type", target: "hour", text: "7" }, t: ["Type 7 into the Hour field.", "\u5728 Hour\uff08\u5c0f\u65f6\uff09\u680f\u8f93\u5165 7\u3002", "Hour\uff08\u6642\uff09\u306e\u6b04\u306b 7 \u3092\u5165\u529b\u3057\u307e\u3059\u3002"] },
      { s: "alarmH", k: "act", a: { type: "type", target: "minute", text: "30" }, t: ["Type 30 into the Minute field.", "\u5728 Minute\uff08\u5206\u949f\uff09\u680f\u8f93\u5165 30\u3002", "Minute\uff08\u5206\uff09\u306e\u6b04\u306b 30 \u3092\u5165\u529b\u3057\u307e\u3059\u3002"] },
      { s: "alarmHM", k: "act", a: { type: "tap", target: "savebtn" }, t: ["7:30 with AM selected matches the request. Tap Save.", "7:30\u3001\u5df2\u9009 AM\uff0c\u7b26\u5408\u8981\u6c42\u3002\u70b9\u51fb Save\uff08\u4fdd\u5b58\uff09\u3002", "7:30\u3001AM \u9078\u629e\u6e08\u307f\u3067\u8981\u6c42\u3069\u304a\u308a\u3067\u3059\u3002Save\uff08\u4fdd\u5b58\uff09\u3092\u30bf\u30c3\u30d7\u3057\u307e\u3059\u3002"] },
      { s: "clockDone", k: "done", a: { type: "finish" }, t: ["Verify: the list shows 7:30 AM, switched on. The task is done.", "\u9a8c\u8bc1\uff1a\u5217\u8868\u4e2d\u51fa\u73b0\u4e86 7:30 AM\uff0c\u4e14\u5df2\u5f00\u542f\u3002\u4efb\u52a1\u5b8c\u6210\u3002", "\u78ba\u8a8d\uff1a\u4e00\u89a7\u306b 7:30 AM \u304c\u30aa\u30f3\u3067\u8868\u793a\u3055\u308c\u3066\u3044\u307e\u3059\u3002\u30bf\u30b9\u30af\u5b8c\u4e86\u3067\u3059\u3002"] }
    ]
  ];

  // ------------------------------------------------------------------------------------------
  // Observations as text
  // ------------------------------------------------------------------------------------------
  function marks(scr) {
    var l = SCREENS[scr], out = [];
    for (var i = 0; i < l.length; i++) if (l[i].click && !l[i].hidden) out.push(l[i]);
    return out;
  }
  function markOf(scr, id) { var m = marks(scr); for (var i = 0; i < m.length; i++) if (m[i].id === id) return i + 1; return 0; }
  var ROLE = { appicon: "button", search: "edit_text", switchrow: "switch", row: "button", tile: "image_button", image: "image",
    iconbtn: "image_button", textbtn: "button", avatar: "button", appchip: "button", tab: "tab", alarmrow: "switch",
    fab: "button", field: "edit_text", seg: "radio_button", bigbtn: "button", msginput: "edit_text", bubble: "image", text: "text", title: "text" };
  function treeText(scr) {
    var l = SCREENS[scr], lines = ["window \"" + (l[0].label || "Home") + "\""];
    if (scr === "home") lines = ["window \"Launcher\""];
    for (var i = 0; i < l.length; i++) {
      var e = l[i];
      if (e.hidden || e.role === "dim" || (e.role === "title" && i === 0)) continue;
      if (e.role === "sheet") { lines.push("  dialog \"" + e.label + "\""); continue; }
      var name = e.desc || e.label || "";
      if (e.role === "alarmrow") name = e.label + ", " + e.sub;
      if (e.role === "field") name = e.label + (e.value ? " = " + e.value : " (empty)");
      var s = "  " + (ROLE[e.role] || e.role) + " \"" + name + "\"";
      if (e.on !== undefined) s += " checked=" + (e.on ? "true" : "false");
      if (e.sel !== undefined) s += " selected=" + (e.sel ? "true" : "false");
      if (e.click) s += " clickable";
      s += " [" + e.x + "," + e.y + "," + (e.x + e.w) + "," + (e.y + e.h) + "]";
      lines.push(s);
    }
    return lines.join("\n");
  }
  function actionText(step, mode, li) {
    var a = step.a, scr = step.s;
    if (a.type === "finish") return "finish(status=\"done\")";
    if (a.type === "back") return "press_back()";
    if (a.type === "ask") return "ask_user(\"" + a.text[li] + "\")";
    var e = find(scr, a.target), pt = a.pt || center(e);
    var fn = a.type === "type" ? "type" : "tap";
    var txt = a.type === "type" ? ", text=\"" + a.text + "\"" : "";
    if (mode === 0) return fn + "(x=" + Math.round(pt[0]) + ", y=" + Math.round(pt[1]) + txt + ")";
    if (mode === 1) return fn + "(mark=" + markOf(scr, a.target) + txt + ")";
    return fn + "(node=\"" + (e.desc || e.label) + "\"" + txt + ")";
  }

  // ------------------------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function font(ctx, px, bold) { ctx.font = (bold ? "bold " : "") + px + "px system-ui, -apple-system, 'Segoe UI', sans-serif"; }
  function photo(ctx, x, y, w, h, pal) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = pal[0]; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.moveTo(x, y + h * 0.7);
    ctx.quadraticCurveTo(x + w * 0.4, y + h * 0.55, x + w, y + h * 0.68); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.3, Math.min(w, h) * 0.11, 0, 7); ctx.fill();
    ctx.restore();
  }
  function sw(ctx, x, y, on) {
    ctx.fillStyle = on ? "#9467bd" : "#c8c8c8"; rr(ctx, x, y, 44, 22, 11); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + (on ? 33 : 11), y + 11, 8.5, 0, 7); ctx.fill();
  }
  function glyph(ctx, g, cx, cy) {
    ctx.save(); ctx.strokeStyle = "#333"; ctx.fillStyle = "#333"; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    if (g === "back") { ctx.moveTo(cx + 8, cy); ctx.lineTo(cx - 8, cy); ctx.moveTo(cx - 2, cy - 7); ctx.lineTo(cx - 9, cy); ctx.lineTo(cx - 2, cy + 7); ctx.stroke(); }
    else if (g === "share") {
      var p = [[cx + 7, cy - 8], [cx - 7, cy], [cx + 7, cy + 8]];
      ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.stroke();
      p.forEach(function (q) { ctx.beginPath(); ctx.arc(q[0], q[1], 3.6, 0, 7); ctx.fill(); });
    } else if (g === "edit") { ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 6, cy - 6); ctx.lineTo(cx + 9, cy - 3); ctx.lineTo(cx - 5, cy + 11); ctx.closePath(); ctx.stroke(); }
    else if (g === "star") {
      for (var i = 0; i < 10; i++) { var r = i % 2 ? 4.5 : 10, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      ctx.closePath(); ctx.stroke();
    } else if (g === "info") { ctx.arc(cx, cy, 10, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - 1); ctx.lineTo(cx, cy + 6); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy - 5, 1.6, 0, 7); ctx.fill(); }
    else if (g === "trash") { ctx.moveTo(cx - 9, cy - 7); ctx.lineTo(cx + 9, cy - 7); ctx.moveTo(cx - 3, cy - 10); ctx.lineTo(cx + 3, cy - 10); ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx - 5, cy + 10); ctx.lineTo(cx + 5, cy + 10); ctx.lineTo(cx + 7, cy - 6); ctx.stroke(); }
    else if (g === "send") { ctx.moveTo(cx - 10, cy - 9); ctx.lineTo(cx + 11, cy); ctx.lineTo(cx - 10, cy + 9); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.fillStyle = "#9467bd"; ctx.fill(); }
    else if (g === "crop") { ctx.moveTo(cx - 6, cy - 11); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx + 11, cy + 6); ctx.moveTo(cx - 11, cy - 6); ctx.lineTo(cx + 6, cy - 6); ctx.lineTo(cx + 6, cy + 11); ctx.stroke(); }
    else if (g === "sliders") { [-6, 0, 6].forEach(function (d, i) { ctx.moveTo(cx - 10, cy + d); ctx.lineTo(cx + 10, cy + d); }); ctx.stroke(); [-4, 5, -1].forEach(function (d, i) { ctx.beginPath(); ctx.arc(cx + d, cy - 6 + 6 * i, 2.8, 0, 7); ctx.fill(); }); }
    else if (g === "filter") { ctx.arc(cx - 3, cy - 2, 6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 3, cy - 2, 6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + 4, 6, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
  function drawEl(ctx, e) {
    var x = e.x, y = e.y, w = e.w, h = e.h;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    switch (e.role) {
      case "title":
        ctx.fillStyle = "#ede7f6"; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#222"; font(ctx, 20, true); ctx.fillText(e.label, e.tx, y + h / 2); break;
      case "appicon":
        ctx.fillStyle = e.color; rr(ctx, x, y, w, h, 16); ctx.fill(); ctx.fillStyle = "#fff"; font(ctx, 24, true); ctx.textAlign = "center";
        ctx.fillText(e.glyph, x + w / 2, y + h / 2); ctx.fillStyle = "#222"; font(ctx, 13); ctx.fillText(e.label, x + w / 2, y + h + 14); break;
      case "search":
        ctx.fillStyle = "#f1f1f1"; rr(ctx, x, y, w, h, h / 2); ctx.fill(); ctx.fillStyle = "#999"; font(ctx, 15); ctx.fillText(e.label, x + 18, y + h / 2); break;
      case "row": case "switchrow":
        ctx.fillStyle = "#f6f6f6"; rr(ctx, x, y, w, h, 8); ctx.fill(); ctx.strokeStyle = "#d6d6d6"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#222"; font(ctx, 16);
        if (e.sub) { ctx.fillText(e.label, x + 14, y + h / 2 - 9); ctx.fillStyle = "#777"; font(ctx, 12); ctx.fillText(e.sub, x + 14, y + h / 2 + 11); }
        else ctx.fillText(e.label, x + 14, y + h / 2);
        if (e.role === "switchrow") sw(ctx, x + w - 60, y + h / 2 - 11, e.on);
        else { ctx.fillStyle = "#999"; ctx.fillText(">", x + w - 22, y + h / 2); }
        break;
      case "tile": photo(ctx, x, y, w, h, e.pal); break;
      case "image":
        photo(ctx, x, y, w, h, e.pal);
        if (e.crop) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0] + 26 * c[2], c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + 26 * c[3]); ctx.stroke(); }); }
        break;
      case "iconbtn": glyph(ctx, e.glyph, x + w / 2, y + h / 2); break;
      case "textbtn": ctx.fillStyle = "#6a3fb5"; font(ctx, 16, true); ctx.textAlign = "center"; ctx.fillText(e.label, x + w / 2, y + h / 2); break;
      case "dim": ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.fillRect(x, y, w, h); break;
      case "sheet":
        ctx.fillStyle = "#fff"; rr(ctx, x, y, w, h + 20, 18); ctx.fill(); ctx.fillStyle = "#ccc"; rr(ctx, 160, y + 8, 40, 5, 2.5); ctx.fill();
        ctx.fillStyle = "#222"; font(ctx, 17, true); ctx.fillText(e.label, 20, y + 30); break;
      case "avatar":
        ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(x + w / 2, y + 30, 26, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; font(ctx, 20, true);
        ctx.textAlign = "center"; ctx.fillText(e.label[0], x + w / 2, y + 30); ctx.fillStyle = "#222"; font(ctx, 13); ctx.fillText(e.label, x + w / 2, y + 74); break;
      case "appchip":
        ctx.fillStyle = e.color; rr(ctx, x + w / 2 - 24, y + 6, 48, 48, 12); ctx.fill(); ctx.fillStyle = "#222"; font(ctx, 12); ctx.textAlign = "center";
        ctx.fillText(e.label, x + w / 2, y + 72); break;
      case "text": ctx.fillStyle = "#888"; font(ctx, 13); ctx.textAlign = "center"; ctx.fillText(e.label, x + w / 2, y + h / 2); break;
      case "bubble":
        ctx.fillStyle = "#e8e0f5"; rr(ctx, x, y, w, h, 14); ctx.fill(); photo(ctx, x + 10, y + 10, w - 20, h - 40, e.pal);
        ctx.fillStyle = "#666"; font(ctx, 12); ctx.textAlign = "right"; ctx.fillText("Delivered", x + w - 10, y + h - 14); break;
      case "msginput":
        ctx.fillStyle = "#f1f1f1"; rr(ctx, x, y, w, h, h / 2); ctx.fill();
        if (e.attach) { photo(ctx, x + 10, y + 8, 36, 36, PAL[0]); ctx.fillStyle = "#999"; font(ctx, 15); ctx.fillText(e.label, x + 56, y + h / 2); }
        else { ctx.fillStyle = "#999"; font(ctx, 15); ctx.fillText(e.label, x + 18, y + h / 2); }
        break;
      case "tab":
        ctx.fillStyle = e.sel ? "#6a3fb5" : "#555"; font(ctx, 15, e.sel); ctx.textAlign = "center"; ctx.fillText(e.label, x + w / 2, y + h / 2);
        if (e.sel) { ctx.fillRect(x + 20, y + h - 4, w - 40, 3); } break;
      case "alarmrow":
        ctx.fillStyle = "#f6f6f6"; rr(ctx, x, y, w, h, 10); ctx.fill(); ctx.fillStyle = e.on ? "#222" : "#888"; font(ctx, 26);
        ctx.fillText(e.label, x + 16, y + h / 2 - 8); font(ctx, 12); ctx.fillStyle = "#777"; ctx.fillText(e.sub, x + 18, y + h / 2 + 20);
        sw(ctx, x + w - 62, y + h / 2 - 11, e.on); break;
      case "fab":
        ctx.fillStyle = "#9467bd"; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(x + w / 2 - 11, y + h / 2); ctx.lineTo(x + w / 2 + 11, y + h / 2); ctx.moveTo(x + w / 2, y + h / 2 - 11); ctx.lineTo(x + w / 2, y + h / 2 + 11); ctx.stroke(); break;
      case "field":
        ctx.fillStyle = "#666"; font(ctx, 12); ctx.fillText(e.label, x + 4, y + 10);
        ctx.fillStyle = "#f6f6f6"; rr(ctx, x, y + 22, w, h - 22, 8); ctx.fill(); ctx.strokeStyle = "#cfcfcf"; ctx.lineWidth = 1.2; ctx.stroke();
        if (e.value) { ctx.fillStyle = "#222"; font(ctx, 24); ctx.fillText(e.value, x + 14, y + 22 + (h - 22) / 2); }
        else { ctx.fillStyle = "#aaa"; font(ctx, 15); ctx.fillText(e.ph || "--", x + 14, y + 22 + (h - 22) / 2); }
        break;
      case "seg":
        ctx.fillStyle = e.sel ? "#9467bd" : "#efefef"; rr(ctx, x + 2, y, w - 4, h, 10); ctx.fill(); ctx.fillStyle = e.sel ? "#fff" : "#444"; font(ctx, 16, true);
        ctx.textAlign = "center"; ctx.fillText(e.label, x + w / 2, y + h / 2); break;
      case "bigbtn":
        ctx.fillStyle = "#9467bd"; rr(ctx, x, y, w, h, 12); ctx.fill(); ctx.fillStyle = "#fff"; font(ctx, 17, true); ctx.textAlign = "center"; ctx.fillText(e.label, x + w / 2, y + h / 2); break;
    }
  }
  function drawPhone(ctx, scr, opt) {
    ctx.save(); ctx.translate(M, M);
    ctx.fillStyle = "#1e1e1e"; rr(ctx, -M, -M, PW + 2 * M, PH + 2 * M, 30); ctx.fill();
    ctx.save(); rr(ctx, 0, 0, PW, PH, 24); ctx.clip();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, PW, PH);
    // status bar and nav bar
    ctx.fillStyle = "#222"; font(ctx, 13, true); ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText("9:41", 18, 12);
    ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; ctx.strokeRect(318, 6, 22, 11); ctx.fillRect(320, 8, 15, 7);
    var l = SCREENS[scr];
    for (var i = 0; i < l.length; i++) drawEl(ctx, l[i]);
    ctx.fillStyle = "#f4f4f4"; ctx.fillRect(0, 640, PW, 40);
    ctx.strokeStyle = "#555"; ctx.lineWidth = 2; ctx.fillStyle = opt.backHi ? "#d62728" : "#555";
    ctx.beginPath(); ctx.moveTo(98, 650); ctx.lineTo(84, 660); ctx.lineTo(98, 670); ctx.closePath(); if (opt.backHi) ctx.fill(); else ctx.stroke();
    ctx.beginPath(); ctx.arc(180, 660, 9, 0, 7); ctx.stroke(); ctx.strokeRect(263, 652, 16, 16);
    // Set-of-Mark overlay
    if (opt.som) {
      var mk = marks(scr);
      mk.forEach(function (e, k) {
        ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.6; ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
        var lab = String(k + 1); font(ctx, 12, true); var tw = ctx.measureText(lab).width + 8;
        ctx.fillStyle = "#d62728"; ctx.fillRect(e.x, e.y, tw, 16); ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(lab, e.x + 4, e.y + 8.5);
      });
    }
    if (opt.outline) {
      marks(scr).forEach(function (e) { ctx.strokeStyle = "rgba(31,119,180,0.45)"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1); });
      ctx.setLineDash([]);
    }
    if (opt.draw) opt.draw(ctx);
    ctx.restore();
    ctx.strokeStyle = "#444"; ctx.lineWidth = 2; rr(ctx, 0, 0, PW, PH, 24); ctx.stroke();
    ctx.restore();
  }

  // deterministic standard-normal samples (Box-Muller on a fixed LCG)
  var GAUSS = (function () {
    var s = 12345, out = [];
    function u() { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; }
    for (var i = 0; i < 200; i++) {
      var r = Math.sqrt(-2 * Math.log(u())), t = 2 * Math.PI * u();
      out.push([r * Math.cos(t), r * Math.sin(t)]); out.push([r * Math.sin(t), -r * Math.cos(t)]);
    }
    return out;
  })();
  function hitAt(scr, p) {
    var l = SCREENS[scr];
    for (var i = l.length - 1; i >= 0; i--) {
      var e = l[i];
      if (!e.click || e.hidden) continue;
      if (p[0] >= e.x && p[0] <= e.x + e.w && p[1] >= e.y && p[1] <= e.y + e.h) return e;
    }
    return null;
  }
  function elName(e) { return e ? "\"" + (e.desc || e.label) + "\" (" + (ROLE[e.role] || e.role) + ")" : null; }

  // ------------------------------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------------------------------
  function el(tag, css, parent, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  var BTN = "padding:4px 10px;border:1px solid #bbb;border-radius:6px;cursor:pointer;font-size:14px;background:#f3f3f3;color:#222;";

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = TXT[lang], li = { en: 0, zh: 1, ja: 2 }[lang];
    root.style.background = "#fafafa";
    root.style.minHeight = "0";
    root.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    root.style.color = "#222";
    var bar1 = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #e3e3e3;background:#fff;", root);
    var epBtns = T.epShort.map(function (n, i) {
      var b = el("button", BTN, bar1, n);
      b.addEventListener("click", function () { ep = i; step = 0; gp = null; update(); });
      return b;
    });
    var bar2 = el("div", "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:6px 10px;border-bottom:1px solid #e3e3e3;background:#fff;font-size:14px;", root);
    var modeWrap = el("span", "display:inline-flex;gap:4px;", bar2);
    var mBtns = [T.modeEp, T.modeGr].map(function (n, i) {
      var b = el("button", BTN, modeWrap, n);
      b.addEventListener("click", function () { mode = i; update(); });
      return b;
    });
    var obsWrap = el("span", "display:inline-flex;gap:4px;flex-wrap:wrap;", bar2);
    var oBtns = T.obs.map(function (n, i) {
      var b = el("button", BTN, obsWrap, n);
      b.addEventListener("click", function () { obs = i; update(); });
      return b;
    });
    var sigWrap = el("label", "display:inline-flex;gap:6px;align-items:center;", bar2);
    el("span", "", sigWrap, T.sigma);
    var sig = el("input", "width:120px;", sigWrap);
    sig.type = "range"; sig.min = "0"; sig.max = "30"; sig.step = "1"; sig.value = "8";
    var sigVal = el("span", "font-variant-numeric:tabular-nums;min-width:44px;", sigWrap, "8 px");
    sig.addEventListener("input", function () { sigVal.textContent = sig.value + " px"; update(); });

    var main = el("div", "display:flex;flex-wrap:wrap;gap:12px;padding:10px;align-items:flex-start;", root);
    var cwrap = el("div", "flex:0 0 auto;", main);
    var canvas = el("canvas", "display:block;touch-action:none;cursor:crosshair;", cwrap);
    var info = el("div", "flex:1 1 240px;min-width:220px;font-size:14px;line-height:1.5;", main);

    var bar3 = el("div", "display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 10px;border-top:1px solid #e3e3e3;background:#fff;font-size:14px;", root);
    var bReset = el("button", BTN, bar3, T.reset);
    var bPrev = el("button", BTN, bar3, T.prev);
    var bNext = el("button", BTN + "background:#9467bd;color:#fff;border-color:#9467bd;", bar3, T.next);
    var counter = el("span", "font-variant-numeric:tabular-nums;color:#555;", bar3);
    bReset.addEventListener("click", function () { step = 0; gp = null; update(); });
    bPrev.addEventListener("click", function () { if (step > 0) { step--; gp = null; update(); } });
    bNext.addEventListener("click", function () { if (step < EPISODES[ep].length - 1) { step++; gp = null; update(); } });

    var ep = 1, step = 0, mode = 0, obs = 0, gp = null, S = 1, dpr = 1;

    function style(btns, sel) {
      btns.forEach(function (b, i) {
        b.style.background = i === sel ? "#9467bd" : "#f3f3f3";
        b.style.color = i === sel ? "#fff" : "#222";
        b.style.borderColor = i === sel ? "#9467bd" : "#bbb";
      });
    }
    function resize() {
      var W = root.clientWidth || 600;
      var pw = W >= 620 ? Math.min(340, Math.floor(W * 0.46)) : Math.min(W - 20, 360);
      var ph = Math.round(pw * (PH + 2 * M) / (PW + 2 * M));
      dpr = window.devicePixelRatio || 1;
      canvas.style.width = pw + "px"; canvas.style.height = ph + "px";
      canvas.width = Math.round(pw * dpr); canvas.height = Math.round(ph * dpr);
      S = pw / (PW + 2 * M);
      draw();
    }
    function curStep() { return EPISODES[ep][step]; }
    function defaultPoint(scr) {
      var e = find(scr, "share") && !find(scr, "share").hidden ? find(scr, "share") : marks(scr)[0];
      return center(e);
    }
    function draw() {
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
      ctx.clearRect(0, 0, PW + 2 * M, PH + 2 * M);
      var st = curStep(), scr = st.s;
      if (mode === 0) {
        drawPhone(ctx, scr, {
          som: obs === 1, backHi: st.a.type === "back",
          draw: function (c) { drawAction(c, st); }
        });
      } else {
        var p = gp || defaultPoint(scr), s = +sig.value, tgt = hitAt(scr, p);
        drawPhone(ctx, scr, {
          outline: true,
          draw: function (c) {
            if (s > 0) {
              c.strokeStyle = "rgba(148,103,189,0.7)"; c.lineWidth = 1.5; c.beginPath(); c.arc(p[0], p[1], 2 * s, 0, 7); c.stroke();
              GAUSS.forEach(function (z) {
                var q = [p[0] + s * z[0], p[1] + s * z[1]], h = hitAt(scr, q);
                c.fillStyle = h === tgt && h ? "rgba(44,160,44,0.75)" : (h ? "rgba(255,127,14,0.85)" : "rgba(127,127,127,0.7)");
                c.beginPath(); c.arc(q[0], q[1], 1.8, 0, 7); c.fill();
              });
            }
            if (tgt) { c.strokeStyle = "#2ca02c"; c.lineWidth = 3; c.strokeRect(tgt.x, tgt.y, tgt.w, tgt.h); }
            crosshair(c, p, "#d62728");
          }
        });
      }
    }
    function crosshair(c, p, col) {
      c.strokeStyle = col; c.lineWidth = 2.5;
      c.beginPath(); c.arc(p[0], p[1], 11, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(p[0] - 17, p[1]); c.lineTo(p[0] - 5, p[1]); c.moveTo(p[0] + 5, p[1]); c.lineTo(p[0] + 17, p[1]);
      c.moveTo(p[0], p[1] - 17); c.lineTo(p[0], p[1] - 5); c.moveTo(p[0], p[1] + 5); c.lineTo(p[0], p[1] + 17); c.stroke();
    }
    function drawAction(c, st) {
      var a = st.a;
      if (a.type === "tap" || a.type === "type") {
        var e = find(st.s, a.target), p = a.pt || center(e);
        if (a.type === "type") {
          c.strokeStyle = "#1f77b4"; c.lineWidth = 3; c.strokeRect(e.x - 2, e.y + 20, e.w + 4, e.h - 18);
          c.fillStyle = "#1f77b4"; rr(c, e.x + e.w - 58, e.y - 6, 62, 26, 8); c.fill();
          c.fillStyle = "#fff"; font(c, 14, true); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("\"" + a.text + "\"", e.x + e.w - 27, e.y + 7);
        } else {
          crosshair(c, p, st.k === "error" ? "#ff7f0e" : "#d62728");
          if (obs === 1) {
            var mk = markOf(st.s, a.target);
            if (mk) { c.strokeStyle = "#d62728"; c.lineWidth = 3; c.strokeRect(e.x, e.y, e.w, e.h); }
          }
        }
      } else if (a.type === "finish") {
        c.fillStyle = "rgba(44,160,44,0.92)"; rr(c, 60, 590, 240, 40, 12); c.fill();
        c.fillStyle = "#fff"; font(c, 17, true); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("\u2713 finish", 180, 610);
      } else if (a.type === "ask") {
        c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(0, 24, PW, 616);
        c.fillStyle = "#fff"; rr(c, 30, 230, 300, 170, 16); c.fill();
        c.fillStyle = "#6a3fb5"; font(c, 13, true); c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(T.agentAsks, 50, 258);
        c.fillStyle = "#222"; font(c, 16); wrapText(c, a.text[li], 50, 290, 260, 21);
        c.fillStyle = "#9467bd"; rr(c, 200, 348, 110, 36, 10); c.fill(); c.fillStyle = "#fff"; font(c, 15, true); c.textAlign = "center";
        c.fillText(T.user + ": " + T.yes, 255, 366);
      }
    }
    function wrapText(c, s, x, y, w, lh) {
      var words = /[\u3000-\u9fff]/.test(s) ? s.split("") : s.split(" "), line = "", sep = /[\u3000-\u9fff]/.test(s) ? "" : " ";
      for (var i = 0; i < words.length; i++) {
        var t = line ? line + sep + words[i] : words[i];
        if (c.measureText(t).width > w && line) { c.fillText(line, x, y); y += lh; line = words[i]; } else line = t;
      }
      if (line) c.fillText(line, x, y);
    }
    function row(parent, k, v, css) {
      var d = el("div", "margin:0 0 6px 0;", parent);
      el("b", "color:#555;", d, k + ": ");
      var s = el("span", css || "", d, v);
      return s;
    }
    function renderInfo() {
      info.innerHTML = "";
      var st = curStep();
      row(info, T.instr, T.ep[ep], "font-weight:600;");
      if (mode === 0) {
        var kc = { act: "#9467bd", error: "#ff7f0e", reflect: "#1f77b4", ask: "#d62728", done: "#2ca02c" }[st.k];
        var d = el("div", "margin:0 0 6px 0;", info);
        el("b", "color:#555;", d, (lang === "zh" ? T.step + " " + (step + 1) + " \u6b65" : T.step + " " + (step + 1)) + " ");
        el("span", "display:inline-block;padding:0 8px;border-radius:10px;color:#fff;font-size:12px;background:" + kc + ";", d, T.kinds[st.k]);
        if (obs === 0) row(info, T.observation, T.obsShot);
        else if (obs === 1) row(info, T.observation, T.obsSom(marks(st.s).length));
        else {
          row(info, T.observation, T.obsTree);
          el("pre", "margin:0 0 8px 0;padding:6px 8px;max-height:220px;overflow:auto;background:#fff;border:1px solid #ddd;border-radius:6px;font-size:11.5px;line-height:1.35;white-space:pre;", info, treeText(st.s));
        }
        row(info, T.thought, st.t[li]);
        row(info, T.action, actionText(st, obs, li), "font-family:ui-monospace,Menlo,Consolas,monospace;background:#f0ebf8;padding:1px 5px;border-radius:4px;");
        if (st.note && obs === 2) el("div", "margin-top:6px;padding:6px 8px;background:#fff4e5;border-left:3px solid #ff7f0e;font-size:13px;", info, st.note[li]);
        if (st.a.type === "ask") el("div", "margin-top:6px;color:#2ca02c;font-weight:600;", info, T.user + ": " + T.yes);
      } else {
        el("div", "margin:0 0 8px 0;color:#555;font-size:13px;", info, T.grHint);
        var p = gp || defaultPoint(st.s), s = +sig.value, tgt = hitAt(st.s, p);
        row(info, T.grHit + " (" + Math.round(p[0]) + ", " + Math.round(p[1]) + ") " + T.hits, tgt ? elName(tgt) : T.nothing, "font-weight:600;color:" + (tgt ? "#2ca02c" : "#7f7f7f") + ";");
        if (tgt) {
          var m = Math.min(p[0] - tgt.x, tgt.x + tgt.w - p[0], p[1] - tgt.y, tgt.y + tgt.h - p[1]);
          row(info, T.margin, Math.round(m) + " px");
        }
        if (s > 0) {
          var cnt = {}, same = 0, none = 0;
          GAUSS.forEach(function (z) {
            var h = hitAt(st.s, [p[0] + s * z[0], p[1] + s * z[1]]);
            if (!h) none++; else if (h === tgt) same++; else { var n = h.desc || h.label; cnt[n] = (cnt[n] || 0) + 1; }
          });
          var N = GAUSS.length;
          row(info, "sigma = " + s + " px", (100 * same / N).toFixed(0) + "% " + T.sameEl, "color:#2ca02c;font-weight:600;");
          var others = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 3)
            .map(function (k) { return "\"" + k + "\" " + (100 * cnt[k] / N).toFixed(0) + "%"; });
          if (others.length) row(info, T.other, others.join(", "), "color:#d9730d;");
          if (tgt || none) row(info, T.none, (100 * none / N).toFixed(0) + "%", "color:#7f7f7f;");
        }
      }
    }
    function update() {
      style(epBtns, ep); style(mBtns, mode); style(oBtns, obs);
      obsWrap.style.display = mode === 0 ? "inline-flex" : "none";
      sigWrap.style.display = mode === 1 ? "inline-flex" : "none";
      counter.textContent = (step + 1) + " / " + EPISODES[ep].length;
      bPrev.disabled = step === 0; bNext.disabled = step === EPISODES[ep].length - 1;
      bPrev.style.opacity = bPrev.disabled ? 0.5 : 1; bNext.style.opacity = bNext.disabled ? 0.5 : 1;
      draw(); renderInfo();
    }
    function toPhone(ev) {
      var r = canvas.getBoundingClientRect();
      return [Math.max(0, Math.min(PW, (ev.clientX - r.left) / S - M)), Math.max(0, Math.min(PH, (ev.clientY - r.top) / S - M))];
    }
    var dragging = false, pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; draw(); renderInfo(); });
    }
    canvas.addEventListener("pointerdown", function (ev) {
      if (mode !== 1) { mode = 1; }
      dragging = true; gp = toPhone(ev);
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      ev.preventDefault();
      update();
    });
    canvas.addEventListener("pointermove", function (ev) { if (!dragging) return; gp = toPhone(ev); schedule(); });
    function up() { dragging = false; }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); }).observe(root);
    else window.addEventListener("resize", resize);
    update();
    resize();
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].dataset.ready) { nodes[i].dataset.ready = "1"; init(nodes[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
