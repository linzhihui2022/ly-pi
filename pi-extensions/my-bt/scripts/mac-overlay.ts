// BT-7274 overlay notification for macOS
// Compiled to .js for osascript -l JavaScript
// JXA constraints: no import/export, no arrow functions, no async/await

// ═══ Type annotations (stripped during build) ═══
type OverlayColor = "blue" | "orange" | "green" | "red";

ObjC.import("Cocoa");

// Initialize AppKit for osascript/JXA context
$.NSApplicationLoad();

// ═══ Click-to-focus support ═══
var gTargetAppName: string = "";

// Track created windows to hit-test clicks (avoids ObjC.registerSubclass which is broken in JXA)
var gOverlayWindows: $[] = [];

// deno-lint-ignore no-unused-vars
function createOverlay(
  screen: $,
  typeLabel: string,
  title: string,
  subtitle: string,
  duration: number,
  color: string,
  slot: number,
): void {
  // ── Color mapping ──
  var accentR: number = 0.0;
  var accentG: number = 0.75;
  var accentB: number = 1.0;
  switch (color) {
    case "orange":
      accentR = 1.0;
      accentG = 0.6;
      accentB = 0.0;
      break;
    case "green":
      accentR = 0.2;
      accentG = 0.9;
      accentB = 0.4;
      break;
    case "red":
      accentR = 1.0;
      accentG = 0.25;
      accentB = 0.15;
      break;
    // blue is default
  }

  // ── Window dimensions ──
  var winW: number = 280;
  var winH: number = 90;
  var margin: number = 20;
  var slotStep: number = winH + 5;

  // ── Screen position (bottom-right, slots stack upward) ──
  var vf: $ = screen.visibleFrame;
  var x: number = vf.origin.x + vf.size.width - winW - margin;
  var y: number = vf.origin.y + margin + slot * slotStep;

  // ── Window ──
  var nonActivating: number = 1 << 7; // NSWindowStyleMaskNonactivatingPanel
  var win: $ = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(x, y, winW, winH),
    0 | nonActivating,
    2, // NSBackingStoreBuffered
    false,
  );
  win.setBackgroundColor($.NSColor.clearColor);
  win.setOpaque(false);
  win.setHasShadow(true);
  win.setAlphaValue(0.0);
  win.setLevel($.NSStatusWindowLevel);
  win.setCollectionBehavior((1 << 0) | (1 << 4)); // CanJoinAllSpaces | Stationary

  // ── Content view with rounded panel ──
  var contentView: $ = win.contentView;
  contentView.setWantsLayer(true);
  contentView.layer.setCornerRadius(12);
  contentView.layer.setMasksToBounds(true);

  // Background: #0a0c16 at 94% opacity
  contentView.layer.setBackgroundColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.04, 0.05, 0.09, 0.94).CGColor,
  );
  // Border: accent color at 30% opacity
  contentView.layer.setBorderWidth(1);
  contentView.layer.setBorderColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(accentR, accentG, accentB, 0.3)
      .CGColor,
  );

  // ── Type label (top, uppercase, accent color) ──
  var typeField: $ = $.NSTextField.alloc.initWithFrame(
    $.NSMakeRect(16, winH - 28, winW - 32, 14),
  );
  typeField.setStringValue(typeLabel);
  typeField.setTextColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(accentR, accentG, accentB, 1.0),
  );
  typeField.setFont($.NSFont.systemFontOfSize(9));
  typeField.setBezeled(false);
  typeField.setDrawsBackground(false);
  typeField.setEditable(false);
  typeField.setSelectable(false);
  contentView.addSubview(typeField);

  // ── Title (main text, white) ──
  var titleField: $ = $.NSTextField.alloc.initWithFrame(
    $.NSMakeRect(16, winH - 52, winW - 32, 22),
  );
  titleField.setStringValue(title);
  titleField.setTextColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.85, 0.88, 0.95, 1.0),
  );
  titleField.setFont($.NSFont.boldSystemFontOfSize(14));
  titleField.setBezeled(false);
  titleField.setDrawsBackground(false);
  titleField.setEditable(false);
  titleField.setSelectable(false);
  contentView.addSubview(titleField);

  // ── Subtitle (optional, muted gray) ──
  if (subtitle && subtitle.length > 0) {
    var subField: $ = $.NSTextField.alloc.initWithFrame(
      $.NSMakeRect(16, winH - 72, winW - 32, 16),
    );
    subField.setStringValue(subtitle);
    subField.setTextColor(
      $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.45, 0.48, 0.55, 1.0),
    );
    subField.setFont($.NSFont.systemFontOfSize(11));
    subField.setBezeled(false);
    subField.setDrawsBackground(false);
    subField.setEditable(false);
    subField.setSelectable(false);
    contentView.addSubview(subField);
  }

  // ── Gradient bar (bottom accent line) ──
  var barView: $ = $.NSView.alloc.initWithFrame(
    $.NSMakeRect(0, 0, winW, 2),
  );
  barView.setWantsLayer(true);
  barView.layer.setBackgroundColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(accentR, accentG, accentB, 0.8)
      .CGColor,
  );
  contentView.addSubview(barView);

  // ── Show ──
  win.orderFront(null);
  win.setAlphaValue(0.95);

  // Track window for click hit-testing
  gOverlayWindows.push(win);
}

// deno-lint-ignore no-unused-vars
function run(argv: string[]): void {
  var typeLabel: string = argv[0] || "BT-7274";
  var title: string = argv[1] || "";
  var subtitle: string = argv[2] || "";
  var duration: number = parseFloat(argv[3]) || 5;
  var color: string = argv[4] || "blue";
  var slot: number = parseInt(argv[5], 10) || 0;
  gTargetAppName = argv[6] || "WezTerm";

  // ── Create overlay on every screen ──
  var screens: $ = $.NSScreen.screens;
  var count: number = screens.count;
  for (var i: number = 0; i < count; i++) {
    var screen: $ = screens.objectAtIndex(i);
    createOverlay(screen, typeLabel, title, subtitle, duration, color, slot);
  }

  // ── Click-to-focus: detect clicks on any overlay window ──
  // NSEvent.addLocalMonitorForEventsMatchingMask:handler: accepts a JS function as the block.
  // The block receives the event and returns it (or null to suppress).
  $.NSEvent.addLocalMonitorForEventsMatchingMaskHandler(
    1 << 1, // NSEventMaskLeftMouseDown
    function(event: $) {
      var clickWin: $ = event.window;
      if (clickWin) {
        for (var j: number = 0; j < gOverlayWindows.length; j++) {
          if (clickWin.isEqual(gOverlayWindows[j])) {
            if (gTargetAppName) {
              $.NSWorkspace.sharedWorkspace().launchApplication(gTargetAppName);
            }
            $.NSApp.terminate(null);
            return null;
          }
        }
      }
      return event;
    },
  );

  // Schedule termination after duration
  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    duration,
    $.NSApp,
    "terminate:",
    null,
    false,
  );

  $.NSApp.run();
}
