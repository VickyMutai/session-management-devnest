const ADMIN_SECRET = "afrihealth2026";

function sendJson(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function parseBody(req) {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return req.body;
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  if (body?.secret !== ADMIN_SECRET) {
    return sendJson(res, 401, { error: "Invalid admin secret" });
  }

  return sendJson(res, 200, { ok: true });
}
