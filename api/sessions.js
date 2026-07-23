import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

const SESSIONS_PATH = "portal/sessions.json";
const MINUTE = 60;
const ADMIN_SECRET = "afrihealth2026";
const sampleSessions = [
  {
    id: "sample-opening",
    title: "Opening remarks and welcome",
    date: "2026-07-23",
    time: "09:00",
    duration: 30,
    status: "In Progress",
    speaker: "Afrihealth leadership team",
    room: "Main Hall",
    notes: "Kickoff session for all participants and invited guests.",
    updatedAt: "2026-07-23T09:00:00.000Z",
  },
  {
    id: "sample-panel",
    title: "Innovation challenge panel",
    date: "2026-07-23",
    time: "11:00",
    duration: 60,
    status: "Planned",
    speaker: "Guest panelists",
    room: "Breakout Room A",
    notes: "Panel discussion on health innovation and implementation.",
    updatedAt: "2026-07-23T09:15:00.000Z",
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
    time: String(session.time || ""),
    duration: Number(session.duration || 0),
    status: String(session.status || "Planned"),
    speaker: String(session.speaker || "").trim(),
    room: String(session.room || "").trim(),
    notes: String(session.notes || "").trim(),
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
}

function sortSessions(items) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.date || ""}T${left.time || "00:00"}`;
    const rightKey = `${right.date || ""}T${right.time || "00:00"}`;

    if (leftKey === rightKey) {
      return left.title.localeCompare(right.title);
    }

    return leftKey.localeCompare(rightKey);
  });
}

function requireAdmin(request) {
  const provided = request.headers.get("x-admin-secret");
  return Boolean(provided && provided === ADMIN_SECRET);
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
      if (!incoming.id || !incoming.title || !incoming.date || !incoming.time) {
        return json(
          { error: "Title, date, time, and id are required." },
          { status: 400 },
        );
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
