import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

const SESSIONS_PATH = "portal/sessions.json";
const MINUTE = 60;
const sampleSessions = [
  {
    id: "sample-kickoff",
    title: "Challenge kickoff",
    date: "2026-07-23",
    duration: 45,
    status: "Planned",
    notes: "Launch the Afrihealth Innovation Challenge agenda.",
    updatedAt: "2026-07-23T09:00:00.000Z",
  },
  {
    id: "sample-review",
    title: "Innovation review",
    date: "2026-07-24",
    duration: 30,
    status: "In Progress",
    notes: "Review standout ideas and implementation plans.",
    updatedAt: "2026-07-23T10:30:00.000Z",
  },
];

function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

function normalizeSession(session) {
  return {
    id: String(session.id || ""),
    title: String(session.title || "").trim(),
    date: String(session.date || ""),
    duration: Number(session.duration || 0),
    status: String(session.status || "Planned"),
    notes: String(session.notes || "").trim(),
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
}

function sortSessions(items) {
  return [...items].sort((left, right) => {
    if (left.date === right.date) {
      return left.title.localeCompare(right.title);
    }

    return left.date.localeCompare(right.date);
  });
}

function requireAdmin(request) {
  const expected = process.env.ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret");
  return Boolean(expected && provided && provided === expected);
}

async function readSessions() {
  const result = await get(SESSIONS_PATH, {
    access: "private",
  });

  if (!result) {
    return {
      sessions: sortSessions(sampleSessions),
      etag: null,
    };
  }

  const raw = await new Response(result.stream).text();
  const parsed = JSON.parse(raw);

  return {
    sessions: Array.isArray(parsed?.sessions)
      ? sortSessions(parsed.sessions.map(normalizeSession))
      : sortSessions(sampleSessions),
    etag: result.blob.etag,
  };
}

async function writeSessions(nextSessions, etag) {
  const payload = JSON.stringify(
    {
      sessions: sortSessions(nextSessions).map((session) =>
        normalizeSession({ ...session, updatedAt: new Date().toISOString() }),
      ),
    },
    null,
    2,
  );

  await put(SESSIONS_PATH, payload, {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: MINUTE,
    ifMatch: etag ?? undefined,
  });

  return readSessions();
}

export default async function handler(request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return json(
        { error: "BLOB_READ_WRITE_TOKEN is missing on this deployment." },
        { status: 500 },
      );
    }

    if (request.method === "GET") {
      const { sessions } = await readSessions();
      return json({ sessions });
    }

    if (!requireAdmin(request)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessions, etag } = await readSessions();

    if (request.method === "POST") {
      const incoming = normalizeSession(await request.json());
      if (!incoming.id || !incoming.title || !incoming.date) {
        return json({ error: "Title, date, and id are required." }, { status: 400 });
      }

      const nextSessions = sessions.some((session) => session.id === incoming.id)
        ? sessions.map((session) =>
            session.id === incoming.id ? { ...session, ...incoming } : session,
          )
        : [incoming, ...sessions];

      const saved = await writeSessions(nextSessions, etag);
      return json({ sessions: saved.sessions });
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const nextSessions = Array.isArray(body?.sessions)
        ? body.sessions.map(normalizeSession)
        : [];
      const saved = await writeSessions(nextSessions, etag);
      return json({ sessions: saved.sessions });
    }

    if (request.method === "DELETE") {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");

      if (!id) {
        return json({ error: "Missing session id." }, { status: 400 });
      }

      const nextSessions = sessions.filter((session) => session.id !== id);
      const saved = await writeSessions(nextSessions, etag);
      return json({ sessions: saved.sessions });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      return json(
        { error: "Another admin updated the schedule. Retry your change." },
        { status: 409 },
      );
    }

    console.error(error);
    return json({ error: "Unable to process session request." }, { status: 500 });
  }
}
