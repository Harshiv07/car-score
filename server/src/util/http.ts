import { randomUUID } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not catch a rejected promise from an async handler — the
 * request just hangs. Wrapping routes here forwards the rejection to the global
 * error handler, so routes can throw instead of each carrying a try/catch that
 * (as they used to) echoed `error.message` straight back to the client.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/**
 * A whole number within [min, max], else `fallback`. `Number("1.5")`, `"abc"` and
 * `"1e9"` all parse, so a bare `Number()` lets fractional or absurd values reach
 * `slice()` and the pagination maths.
 */
export function intParam(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "string" || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Tags every request with an id (honouring a sane inbound `x-request-id` so a
 * proxy's id survives) and writes one structured line per finished request.
 * Server errors can then be matched to the exact request that caused them.
 */
export function requestLog(): RequestHandler {
  return (req, res, next) => {
    const inbound = req.get("x-request-id");
    const id = inbound && /^[\w.-]{8,64}$/.test(inbound) ? inbound : randomUUID();
    res.locals.requestId = id;
    res.setHeader("x-request-id", id);

    const started = process.hrtime.bigint();
    res.on("finish", () => {
      // Health probes fire constantly and say nothing; keep them out of the log.
      if (req.path === "/healthz") return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          t: new Date().toISOString(),
          id,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ms: Math.round(ms),
        })
      );
    });
    next();
  };
}
