// The Cloudflare Worker that relays requests to shops that block browsers (see worker/).
const PRODUCTION_RELAY = "https://egypt-parts-relay.ahmed-shaalan.workers.dev";
const LOCAL_RELAY = "http://localhost:8787";

const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
export const RELAY_URL = isLocal ? LOCAL_RELAY : PRODUCTION_RELAY;

export const SHOP_TIMEOUT_MS = 25_000; // slow shops get marked failed after this
export const CACHE_MS = 60 * 60 * 1000; // search results are reused for an hour
export const PARTIAL_CACHE_MS = 2 * 60 * 1000; // results with a failed shop are retried sooner
export const MAX_LIST_LINES = 40;
