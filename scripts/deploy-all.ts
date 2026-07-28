const steps = [
  { cwd: "ly-pi", script: "build", label: "build ly-pi" },
  { cwd: "ly-pi", script: "test", label: "test ly-pi" },
  { cwd: "ly-pi", script: "deploy", label: "deploy ly-pi" },
];

for (const { cwd, script, label } of steps) {
  console.log(`\n> ${label}`);
  const proc = Bun.spawn(["bun", "run", script], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`  FAILED: ${label} (exit ${exitCode})`);
    process.exit(exitCode);
  }
}

console.log("\n✓ All deployed successfully");
