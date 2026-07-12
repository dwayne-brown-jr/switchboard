import type { Instrumentation } from "next";

// App-wide server error capture. Next calls onRequestError for any error thrown
// out of a route handler, server action, or server-component render. We route
// it through the observability choke point (DB feed + optional Sentry/webhook).
// Guarded to the Node runtime because reportError uses Prisma (not edge-safe).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  try {
    const { reportError } = await import("./lib/observability");
    await reportError(err, {
      source: "request",
      route: context.routePath || request.path,
      digest,
      extra: { method: request.method, routeType: context.routeType },
    });
  } catch {
    // Never let error reporting break the server.
  }
};
