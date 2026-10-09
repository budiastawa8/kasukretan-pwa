import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApi } from "../server/handler.js";

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleApi(req, res);
}
