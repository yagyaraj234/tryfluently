import { Counter, collectDefaultMetrics, Histogram, Registry } from "prom-client";
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "./app";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: "impromptu_" });

const requests = new Counter({
  name: "impromptu_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});

const requestDuration = new Histogram({
  name: "impromptu_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const metricsMiddleware = (enabled: boolean): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!enabled) return next();

    const end = requestDuration.startTimer({
      method: c.req.method,
      route: "unmatched",
    });
    await next();

    const labels = {
      method: c.req.method,
      route: routePath(c) || "unmatched",
      status_code: String(c.res.status),
    };
    end(labels);
    requests.inc(labels);
  };
