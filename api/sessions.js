import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

const SESSIONS_PATH = "portal/sessions.json";
const MINUTE = 60;
const ADMIN_SECRET = "afrihealth2026";
const BLOB_ACCESS = "public";
const sampleSessions = [
  {
    id: "day1-arrival-registration",
    title: "Arrival and Registrations",
    date: "2026-07-23",
    time: "08:00",
    duration: 60,
    status: "Planned",
    speaker: "",
    room: "Main Hall",
    notes: "",
  },
  {
    id: "day1-opening-ceremony",
    title: "Opening Ceremony",
    date: "2026-07-23",
    time: "09:00",
    duration: 30,
    status: "Planned",
    speaker: "Allan Rop (The Cube)",
    room: "Main Hall",
    notes:
      "Keynote Address: The Future of Innovation, Entrepreneurship, and Digital Transformation in Africa. Other participants: KNCCI Chairman and Directors; Willy Kenei.",
  },
  {
    id: "day1-africa-health-collaboration",
    title: "Africa Health Collaboration",
    date: "2026-07-23",
    time: "09:30",
    duration: 45,
    status: "Planned",
    speaker: "Prof. Patrick Kere / Prof. Charles Lagat",
    room: "Main Hall",
    notes: "What is AHC? What they are trying to do in the health sector.",
  },
  {
    id: "day1-tea-break-morning",
    title: "Tea Break",
    date: "2026-07-23",
    time: "10:15",
    duration: 15,
    status: "Planned",
    speaker: "",
    room: "Main Hall",
    notes: "",
  },
  {
    id: "day1-beyond-funding",
    title: "Beyond Funding: Understanding Risk in Startup",
    date: "2026-07-23",
    time: "10:15",
    duration: 45,
    status: "Planned",
    speaker: "James Kamau (AAR Insurance)",
    room: "Main Hall",
    notes: "",
  },
  {
    id: "day1-digital-innovation-commercialization",
    title:
      "Digital Innovation, Commercialization, Partnerships, and Scaling Health Enterprises",
    date: "2026-07-23",
    time: "11:15",
    duration: 45,
    status: "Planned",
    speaker: "Moderator: Kalaka Simbili (Niko Eldy)",
    room: "Main Hall",
    notes:
      "Panelists: Dr. Joel and Dr. Akama, Moi University; Kenneth Kibet, Konza Technopolis; CPA Anthony Kiplimo, KNCCI; Waziri Kemei and Titus Mengich, Uasin Gishu County.",
  },
  {
    id: "day1-building-future-ready-enterprises",
    title: "Building Future-Ready Enterprises",
    date: "2026-07-23",
    time: "11:15",
    duration: 45,
    status: "Planned",
    speaker: "Emmanuel Cheisro (Digitax)",
    room: "Breakout Room 1",
    notes:
      "Tax Compliance Made Simple: Building Sustainable and Compliant Businesses.",
  },
  {
    id: "day1-health-track-1-pitches",
    title: "Health Track 1 Pitches",
    date: "2026-07-23",
    time: "12:00",
    duration: 60,
    status: "Planned",
    speaker: "Moi University / Africa Health Collaborative",
    room: "Main Hall",
    notes:
      "Pitches from the Moi University and Africa Health Collaborative project.",
  },
  {
    id: "day1-lunch",
    title: "Lunch",
    date: "2026-07-23",
    time: "13:00",
    duration: 60,
    status: "Planned",
    speaker: "",
    room: "Main Hall",
    notes: "",
  },
];

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

function normalizeSession(session) {
  return {
    id: String(session?.id || ""),
    title: String(session?.title || "").trim(),
    date: String(session?.date || ""),
    time: String(session?.time || ""),
    duration: Number(session?.duration || 0),
    status: String(session?.status || "Planned"),
    speaker: String(session?.speaker || "").trim(),
    room: String(session?.room || "").trim(),
    notes: String(session?.notes || "").trim(),
    updatedAt: session?.updatedAt || new Date().toISOString(),
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

function requireAdmin(req) {
  const provided = req.headers["x-admin-secret"];
  return typeof provided === "string" && provided === ADMIN_SECRET;
}

async function readSessions() {
  const result = await get(SESSIONS_PATH, {
    access: BLOB_ACCESS,
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
    access: BLOB_ACCESS,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: MINUTE,
    ifMatch: etag ?? undefined,
  });

  return readSessions();
}

export default async function handler(req, res) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return sendJson(res, 500, {
        error: "BLOB_READ_WRITE_TOKEN is missing on this deployment.",
      });
    }

    if (req.method === "GET") {
      const { sessions } = await readSessions();
      return sendJson(res, 200, { sessions });
    }

    if (!requireAdmin(req)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    const { sessions, etag } = await readSessions();

    if (req.method === "POST") {
      const incoming = normalizeSession(parseBody(req));
      if (!incoming.id || !incoming.title || !incoming.date || !incoming.time) {
        return sendJson(res, 400, {
          error: "Title, date, time, and id are required.",
        });
      }

      const nextSessions = sessions.some(
        (session) => session.id === incoming.id,
      )
        ? sessions.map((session) =>
            session.id === incoming.id ? { ...session, ...incoming } : session,
          )
        : [incoming, ...sessions];

      const saved = await writeSessions(nextSessions, etag);
      return sendJson(res, 200, { sessions: saved.sessions });
    }

    if (req.method === "PUT") {
      const body = parseBody(req);
      const nextSessions = Array.isArray(body?.sessions)
        ? body.sessions.map(normalizeSession)
        : [];
      const saved = await writeSessions(nextSessions, etag);
      return sendJson(res, 200, { sessions: saved.sessions });
    }

    if (req.method === "DELETE") {
      const id = typeof req.query?.id === "string" ? req.query.id : null;
      if (!id) {
        return sendJson(res, 400, { error: "Missing session id." });
      }

      const nextSessions = sessions.filter((session) => session.id !== id);
      const saved = await writeSessions(nextSessions, etag);
      return sendJson(res, 200, { sessions: saved.sessions });
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      return sendJson(res, 409, {
        error: "Another admin updated the schedule. Retry your change.",
      });
    }

    console.error(error);
    return sendJson(res, 500, {
      error: "Unable to process session request.",
    });
  }
}
