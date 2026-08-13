import type { Logger } from "pino";
import type { ReqId } from "pino-http";

// pino-http attaches these to the raw Node http.IncomingMessage at runtime;
// Express's Request extends IncomingMessage, so augmenting it here makes
// `req.log` / `req.id` available (and correctly typed) on every Express Request.
declare module "http" {
  interface IncomingMessage {
    id: ReqId;
    log: Logger;
  }
}
