/**
 * Boot smoke test for the built Host half: load dist/index.js the way the
 * Cordis loader would, call apply() with a stand-in context, and confirm the
 * plugin registers its two HTTP routes, subscribes to the lifecycle events it
 * needs, and returns a disposer that runs cleanly.
 *
 *   node scripts/smoke-host.mjs
 */
const routes = [];
const events = [];
const injections = [];

const ctx = {
  get(name) {
    if (name === "webServer") {
      return {
        register(route) {
          routes.push(route.path);
          return () => {};
        },
      };
    }
    return undefined;
  },
  on(event, listener) {
    events.push(event);
    void listener;
    return () => {};
  },
  inject(deps, callback) {
    injections.push(deps);
    callback(ctx);
    return () => {};
  },
};

const plugin = await import("../dist/index.js");
console.log("name   :", plugin.name);
const dispose = plugin.apply(ctx);

console.log("routes :", routes.join(", "));
console.log("events :", events.join(", "));
console.log("inject :", injections.map((deps) => JSON.stringify(deps)).join(", "));

const missing = [
  "/dsh-ammeter/api/status",
  "/dsh-ammeter/api/refresh",
].filter((path) => !routes.includes(path));
if (missing.length > 0) {
  console.error("MISSING ROUTES:", missing.join(", "));
  process.exitCode = 1;
}
for (const event of ["llm/stream", "agent/status", "credentials/reference-updated"]) {
  if (!events.includes(event)) {
    console.error("MISSING EVENT:", event);
    process.exitCode = 1;
  }
}

if (typeof dispose === "function") {
  dispose();
  console.log("dispose: ok");
} else {
  console.error("apply() did not return a disposer");
  process.exitCode = 1;
}
