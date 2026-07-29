// End-to-end simulation of mySound loading in Pi context
// Dynamically import the built extension module and call mySound

const EXT_PATH = "/Users/lychee/.pi/agent/extensions/ly-pi/index.js";

// Mock pi API (minimal)
const mockPi = {
  registeredCommands: [],
  registeredEvents: [],
  on(event, handler) {
    this.registeredEvents.push(event);
    console.log(`  [pi.on] "${event}" registered`);
  },
  registerCommand(name, opts) {
    this.registeredCommands.push(name);
    console.log(`  [pi.registerCommand] "/${name}" registered`);
  },
  events: {
    on(event, handler) {
      mockPi.registeredEvents.push(event);
      console.log(`  [pi.events.on] "${event}" registered`);
    }
  }
};

// We want to call the mySound function specifically from the built bundle.
// The bundle exports the main ly_pi_default async function.
// We'll import the whole module and extract mySound if possible,
// or just run the full default export and check if /sound was registered.

try {
  const mod = await import(EXT_PATH);
  console.log("Module imported successfully");
  console.log("Exports:", Object.keys(mod));

  if (typeof mod.default === "function") {
    console.log("\nCalling default(pi)...");
    const result = mod.default(mockPi);
    if (result && typeof result.then === "function") {
      await result;
    }
    console.log("\nCommands registered:", mockPi.registeredCommands);
    console.log("Events registered:", mockPi.registeredEvents);
    
    if (mockPi.registeredCommands.includes("sound")) {
      console.log("\n✅ /sound command WAS registered successfully!");
    } else {
      console.log("\n❌ /sound command was NOT registered");
      console.log("Other commands:", mockPi.registeredCommands);
    }
  }
} catch (e) {
  console.error("FAILED:", e.message);
  console.error(e.stack);
}
