const API_URL = "/api/sessions";
const ADMIN_API_URL = "/api/admin";
const ADMIN_STORAGE_KEY = "afrihealth-admin-session";
const REFRESH_INTERVAL_MS = 30000;

const form = document.getElementById("session-form");
const titleInput = document.getElementById("title");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");
const durationInput = document.getElementById("duration");
const statusInput = document.getElementById("status");
const speakerInput = document.getElementById("speaker");
const roomInput = document.getElementById("room");
const notesInput = document.getElementById("notes");
const searchInput = document.getElementById("search");
const dayFilterButtons = Array.from(document.querySelectorAll("[data-day-filter]"));
const roomFilterButtons = Array.from(
  document.querySelectorAll("[data-room-filter]"),
);
const statsContainer = document.getElementById("stats");
const listContainer = document.getElementById("session-list");
const clearAllButton = document.getElementById("clear-all");
const adminForm = document.getElementById("admin-form");
const adminCodeInput = document.getElementById("admin-code");
const adminLogoutButton = document.getElementById("admin-logout");
const adminStatus = document.getElementById("admin-status");
const editorNote = document.getElementById("editor-note");
const formHeading = document.getElementById("form-heading");
const formAction = document.getElementById("form-action");
const cancelEditButton = document.getElementById("cancel-edit");
const syncStatus = document.getElementById("sync-status");

const sampleSessions = [
];

let sessions = [];
let isAdmin = false;
let adminSecret = "";
let editingSessionId = null;
let isApiAvailable = true;
let activeDayFilter = document.body?.dataset.defaultDayFilter || "all";
let activeRoomFilter = "all";
let lastSyncLabel = "Connecting";

function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAdminSession() {
  try {
    const saved = localStorage.getItem(ADMIN_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function storeAdminSession(secret) {
  localStorage.setItem(
    ADMIN_STORAGE_KEY,
    JSON.stringify({ secret, verifiedAt: new Date().toISOString() }),
  );
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
}

function updateSyncStatus(message, tone = "") {
  lastSyncLabel = message;
  if (!syncStatus) {
    return;
  }

  syncStatus.textContent = message;
  syncStatus.classList.remove("error", "muted");
  if (tone) {
    syncStatus.classList.add(tone);
  }
}

function setAdminState(nextAdmin, secret = "") {
  isAdmin = nextAdmin && Boolean(secret);
  adminSecret = isAdmin ? secret : "";

  if (isAdmin) {
    storeAdminSession(secret);
  } else {
    clearAdminSession();
  }

  updateAdminUI();
}

function updateAdminUI() {
  const controls = [
    titleInput,
    dateInput,
    timeInput,
    durationInput,
    statusInput,
    speakerInput,
    roomInput,
    notesInput,
    clearAllButton,
    formAction,
    cancelEditButton,
  ].filter(Boolean);

  const canEdit = isAdmin && isApiAvailable;
  controls.forEach((control) => {
    control.disabled = !canEdit;
  });

  if (editorNote) {
    if (!isApiAvailable) {
      editorNote.textContent =
        "Shared session storage is unavailable. Check the Vercel Blob setup.";
    } else if (isAdmin) {
      editorNote.textContent =
        editingSessionId !== null
          ? "Admin mode enabled. You are editing a live session."
          : "Admin mode enabled. Changes publish to every viewer.";
    } else {
      editorNote.textContent =
        "Admin access is required to add or change session details.";
    }
  }

  if (adminStatus) {
    if (!isApiAvailable) {
      adminStatus.textContent = "API setup required";
      adminStatus.classList.remove("active");
      adminStatus.classList.add("warning");
    } else if (isAdmin) {
      adminStatus.textContent = "Admin access active";
      adminStatus.classList.add("active");
      adminStatus.classList.remove("warning");
    } else {
      adminStatus.textContent = "Admin access required";
      adminStatus.classList.remove("active", "warning");
    }
  }

  if (adminCodeInput) {
    adminCodeInput.value = "";
  }

  if (form) {
    form.classList.toggle("is-readonly", !canEdit);
  }

  if (formHeading) {
    formHeading.textContent =
      editingSessionId !== null ? "Update a session" : "Create a session";
  }

  if (formAction) {
    formAction.textContent =
      editingSessionId !== null ? "Update session" : "Save session";
  }

  if (cancelEditButton) {
    cancelEditButton.hidden = editingSessionId === null;
  }
}

function renderStats() {
  if (!statsContainer) {
    return;
  }

  const filteredSessions = getVisibleSessions();
  const total = filteredSessions.length;
  const completed = filteredSessions.filter(
    (session) => session.status === "Completed",
  ).length;
  const planned = filteredSessions.filter(
    (session) => session.status === "Planned",
  ).length;
  const inProgress = filteredSessions.filter(
    (session) => session.status === "In Progress",
  ).length;

  statsContainer.innerHTML = `
    <div class="stat-card">
      <div>Total Sessions</div>
      <div class="stat-number">${total}</div>
    </div>
    <div class="stat-card">
      <div>In Progress</div>
      <div class="stat-number">${inProgress}</div>
    </div>
    <div class="stat-card">
      <div>Completed</div>
      <div class="stat-number">${completed}</div>
    </div>
    <div class="stat-card">
      <div>Planned</div>
      <div class="stat-number">${planned}</div>
    </div>
  `;
}

function renderSessions() {
  if (!listContainer) {
    return;
  }

  const visibleSessions = getVisibleSessions();

  if (!visibleSessions.length) {
    listContainer.innerHTML =
      '<div class="empty-state">No sessions found. Admins can add program items below.</div>';
    return;
  }

  if (!adminForm) {
    listContainer.innerHTML = renderConcurrentSessionGroups(visibleSessions);
    return;
  }

  listContainer.innerHTML = visibleSessions.map(renderSessionCard).join("");
}

function render() {
  renderStats();
  renderSessions();
  renderDayFilters();
  renderRoomFilters();
  updateAdminUI();
}

function matchesRoomFilter(session) {
  const room = (session.room || "").trim().toLowerCase();

  if (activeRoomFilter === "all") {
    return true;
  }

  if (activeRoomFilter === "main hall") {
    return room.includes("main hall");
  }

  if (activeRoomFilter === "breakout") {
    return room.includes("breakout");
  }

  return true;
}

function matchesDayFilter(session) {
  if (activeDayFilter === "all") {
    return true;
  }

  return session.date === activeDayFilter;
}

function getVisibleSessions() {
  const searchTerm = searchInput?.value.trim().toLowerCase() || "";

  return sessions.filter((session) => {
    const haystack = [
      session.title,
      session.notes,
      session.status,
      session.speaker,
      session.room,
      session.date,
      session.time,
    ]
      .join(" ")
      .toLowerCase();

    return (
      haystack.includes(searchTerm) &&
      matchesRoomFilter(session) &&
      matchesDayFilter(session)
    );
  });
}

function renderConcurrentSessionGroups(visibleSessions) {
  const groups = [];

  visibleSessions.forEach((session) => {
    const key = `${session.date || ""}__${session.time || ""}`;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.key === key) {
      lastGroup.sessions.push(session);
      return;
    }

    groups.push({
      key,
      date: session.date,
      time: session.time,
      sessions: [session],
    });
  });

  return groups
    .map((group) => {
      const slotLabel = `${formatDate(group.date)}${group.time ? ` • ${formatTime(group.time)}` : ""}`;

      return `
        <section class="session-slot">
          <div class="slot-header">
            <div class="slot-time">${slotLabel}</div>
            <div class="slot-count">
              ${group.sessions.length > 1 ? `${group.sessions.length} concurrent sessions` : "Single session"}
            </div>
          </div>
          <div class="session-row${group.sessions.length > 1 ? " is-concurrent" : ""}">
            ${group.sessions.map((session) => renderSessionCard(session, true)).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderSessionCard(session, compact = false) {
  const statusClass =
    session.status === "Completed"
      ? "completed"
      : session.status === "In Progress"
        ? "progress"
        : "planned";
  const actionsMarkup = isAdmin
    ? `
        <div class="card-actions">
          <button data-action="edit" data-id="${session.id}">Edit</button>
          <button data-action="toggle" data-id="${session.id}">Toggle status</button>
          <button class="secondary" data-action="delete" data-id="${session.id}">Delete</button>
        </div>
      `
    : "";

  return `
    <article class="session-card${compact ? " session-card-compact" : ""}">
      <div class="session-top">
        <div>
          <div class="session-kicker">${formatDate(session.date)}${session.time ? ` • ${formatTime(session.time)}` : ""}</div>
          <div class="session-title">${escapeHtml(session.title)}</div>
          <div class="session-meta">${session.duration} min${session.room ? ` • ${escapeHtml(session.room)}` : ""}</div>
        </div>
        <div class="badge ${statusClass}">${escapeHtml(session.status)}</div>
      </div>
      <div class="session-badges">
        ${session.speaker ? `<span class="badge badge-speaker">Speaker: ${escapeHtml(session.speaker)}</span>` : ""}
        ${session.room ? `<span class="badge badge-room">Room: ${escapeHtml(session.room)}</span>` : ""}
        ${session.updatedAt ? `<span class="badge badge-muted">Updated ${formatDateTime(session.updatedAt)}</span>` : ""}
      </div>
      ${session.notes ? `<p class="session-meta session-notes">${escapeHtml(session.notes)}</p>` : ""}
      ${actionsMarkup}
    </article>
  `;
}

function renderRoomFilters() {
  roomFilterButtons.forEach((button) => {
    const isActive = button.dataset.roomFilter === activeRoomFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderDayFilters() {
  dayFilterButtons.forEach((button) => {
    const isActive = button.dataset.dayFilter === activeDayFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function resetForm() {
  editingSessionId = null;
  form?.reset();
  if (durationInput) {
    durationInput.value = "30";
  }
  if (statusInput) {
    statusInput.value = "Planned";
  }
  if (dateInput) {
    dateInput.value = "2026-07-23";
  }
  if (timeInput) {
    timeInput.value = "09:00";
  }
  updateAdminUI();
}

function fillForm(session) {
  editingSessionId = session.id;
  titleInput.value = session.title;
  dateInput.value = session.date;
  timeInput.value = session.time || "";
  durationInput.value = String(session.duration);
  statusInput.value = session.status;
  speakerInput.value = session.speaker || "";
  roomInput.value = session.room || "";
  notesInput.value = session.notes || "";
  updateAdminUI();
}

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function compareSessions(left, right) {
  const leftKey = `${left.date || ""}T${left.time || "00:00"}`;
  const rightKey = `${right.date || ""}T${right.time || "00:00"}`;
  if (leftKey === rightKey) {
    return (left.title || "").localeCompare(right.title || "");
  }

  return leftKey.localeCompare(rightKey);
}

async function fetchSessions(showStatus = true) {
  try {
    const response = await fetch(API_URL, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const payload = await parseJson(response);
    sessions = Array.isArray(payload?.sessions)
      ? payload.sessions.sort(compareSessions)
      : [];
    isApiAvailable = true;

    if (showStatus) {
      updateSyncStatus(`Live sync active • ${formatDateTime(new Date())}`);
    }

    render();
  } catch (error) {
    console.error(error);
    isApiAvailable = false;
    if (!sessions.length) {
      sessions = sampleSessions;
    }
    updateSyncStatus("Shared API unavailable", "error");
    render();
  }
}

async function sendSessionRequest(method, body, id) {
  const response = await fetch(
    id ? `${API_URL}?id=${encodeURIComponent(id)}` : API_URL,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": adminSecret,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  const payload = await parseJson(response).catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time) {
  const parsed = new Date(`2026-07-23T${time}:00`);
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  const parsed = new Date(value);
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin || !isApiAvailable) {
    return;
  }

  const sessionPayload = {
    id: editingSessionId ?? generateId(),
    title: titleInput.value.trim(),
    date: dateInput.value,
    time: timeInput.value,
    duration: Number(durationInput.value),
    status: statusInput.value,
    speaker: speakerInput.value.trim(),
    room: roomInput.value.trim(),
    notes: notesInput.value.trim(),
  };

  if (!sessionPayload.title || !sessionPayload.date || !sessionPayload.time) {
    return;
  }

  formAction.disabled = true;
  updateSyncStatus("Saving changes");

  try {
    const payload = await sendSessionRequest("POST", sessionPayload);
    sessions = payload.sessions.sort(compareSessions);
    isApiAvailable = true;
    resetForm();
    updateSyncStatus("Changes published to all viewers");
    render();
  } catch (error) {
    console.error(error);
    updateSyncStatus(error.message, "error");
  } finally {
    formAction.disabled = false;
  }
});

clearAllButton?.addEventListener("click", async () => {
  if (!isAdmin || !isApiAvailable) {
    return;
  }

  if (!globalThis.confirm("Delete every session from the shared schedule?")) {
    return;
  }

  try {
    const payload = await sendSessionRequest("PUT", { sessions: [] });
    sessions = payload.sessions.sort(compareSessions);
    resetForm();
    updateSyncStatus("All sessions removed");
    render();
  } catch (error) {
    console.error(error);
    updateSyncStatus(error.message, "error");
  }
});

cancelEditButton?.addEventListener("click", () => {
  resetForm();
});

searchInput?.addEventListener("input", render);

dayFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeDayFilter = button.dataset.dayFilter || "all";
    render();
  });
});

roomFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeRoomFilter = button.dataset.roomFilter || "all";
    render();
  });
});

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isApiAvailable) {
    updateSyncStatus("Finish Vercel API setup before admin login", "error");
    return;
  }

  const secret = adminCodeInput.value.trim();
  if (!secret) {
    return;
  }

  updateSyncStatus("Verifying admin access");

  try {
    const response = await fetch(ADMIN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });

    if (!response.ok) {
      throw new Error("Invalid admin code");
    }

    setAdminState(true, secret);
    updateSyncStatus("Admin session verified");
  } catch (error) {
    console.error(error);
    setAdminState(false);
    updateSyncStatus(error.message, "error");
  }
});

adminLogoutButton?.addEventListener("click", () => {
  setAdminState(false);
  resetForm();
  updateSyncStatus(lastSyncLabel, isApiAvailable ? "muted" : "error");
});

listContainer?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !isAdmin || !isApiAvailable) {
    return;
  }

  const { action, id } = button.dataset;
  const session = sessions.find((entry) => entry.id === id);
  if (!session) {
    return;
  }

  if (action === "edit") {
    fillForm(session);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    return;
  }

  if (action === "toggle") {
    const nextStatus = session.status === "Completed" ? "Planned" : "Completed";

    try {
      const payload = await sendSessionRequest("POST", {
        ...session,
        status: nextStatus,
      });
      sessions = payload.sessions.sort(compareSessions);
      updateSyncStatus("Session updated");
      render();
    } catch (error) {
      console.error(error);
      updateSyncStatus(error.message, "error");
    }
  }

  if (action === "delete") {
    if (
      !globalThis.confirm(`Delete "${session.title}" from the shared schedule?`)
    ) {
      return;
    }

    try {
      const payload = await sendSessionRequest("DELETE", null, id);
      sessions = payload.sessions.sort(compareSessions);
      if (editingSessionId === id) {
        resetForm();
      }
      updateSyncStatus("Session deleted");
      render();
    } catch (error) {
      console.error(error);
      updateSyncStatus(error.message, "error");
    }
  }
});

async function bootstrap() {
  if (dateInput && !dateInput.value) {
    dateInput.value = "2026-07-23";
  }

  if (timeInput && !timeInput.value) {
    timeInput.value = "09:00";
  }

  const savedAdmin = getAdminSession();
  if (savedAdmin?.secret) {
    try {
      const response = await fetch(ADMIN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: savedAdmin.secret }),
      });

      if (response.ok) {
        setAdminState(true, savedAdmin.secret);
      } else {
        setAdminState(false);
      }
    } catch {
      setAdminState(false);
    }
  } else {
    updateAdminUI();
  }

  await fetchSessions();
  window.setInterval(() => {
    fetchSessions(false);
  }, REFRESH_INTERVAL_MS);
}

bootstrap();
