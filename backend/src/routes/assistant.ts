import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AssistantService } from "../assistant.js";
import type { makeAuth } from "../plugins/auth.js";

const body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1000) })).min(1).max(12) });

export function assistantRoutes(app: FastifyInstance, d: { assistant?: AssistantService; auth: ReturnType<typeof makeAuth> }) {
  const { assistant, auth } = d;
  app.get("/assistant/enabled", async () => ({ enabled: !!assistant?.enabled }));
  // Works signed out (product questions) and signed in (also knows the customer's own recent orders).
  app.post("/assistant", { preHandler: auth.optionalCustomer, config: { rateLimit: { max: 15, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!assistant) return reply.status(503).send({ error: { code: "ASSISTANT_OFF", message: "The assistant is not available right now. Please use the chat." } });
    return assistant.reply(body.parse(req.body).messages, req.user ?? null, req.ip);
  });
}
