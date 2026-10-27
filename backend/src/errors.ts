import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string) => new AppError(400, "BAD_REQUEST", m);
export const unauthorized = (m = "Authentication required") => new AppError(401, "UNAUTHORIZED", m);
export const forbidden = (m = "You do not have permission") => new AppError(403, "FORBIDDEN", m);
export const notFound = (m = "Not found") => new AppError(404, "NOT_FOUND", m);
export const conflict = (m: string) => new AppError(409, "CONFLICT", m);

export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((rawErr, req, reply) => {
    const err = rawErr as Error;   // Fastify 5 types the error as unknown
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const i of err.issues) fields[i.path.join(".") || "_"] = i.message;
      return reply.status(400).send({ error: { code: "VALIDATION_FAILED", message: "Invalid input", fields } });
    }
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields, details: err.details } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.status(status).send({ error: { code: status === 429 ? "RATE_LIMITED" : "BAD_REQUEST", message: status === 429 ? "Too many requests, slow down" : err.message } });
    }
    req.log.error({ err: { message: err.message, stack: err.stack } }, "unhandled");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } }));
}
