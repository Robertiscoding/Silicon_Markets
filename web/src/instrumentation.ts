/**
 * Next.js startup hook. Runs once when the server process boots.
 *
 * On a local instance we kick off the Puppeteer-driven Ornn scraper in the
 * background so the latest GPU prices are fetched on app startup. The Node-only
 * logic lives in ./instrumentation-node and is imported solely under the
 * `nodejs` runtime guard so the Edge runtime never tries to bundle
 * node:child_process / node:path.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
