function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return json({ error: "ADMIN_SECRET is missing on this deployment." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (body?.secret !== expected) {
    return json({ error: "Invalid admin secret" }, { status: 401 });
  }

  return json({ ok: true });
}
