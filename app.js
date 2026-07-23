const API_URL = "/api/sessions";
const ADMIN_API_URL = "/api/admin";
const ADMIN_STORAGE_KEY = "afrihealth-admin-session";
const REFRESH_INTERVAL_MS = 30000;

const form = document.getElementById("session-form");
const titleInput = document.getElementById("title");
const dateInput = document.getElementById("date");
const durationInput = document.getElementById("duration");
const statusInput = document.getElementById("status");
const notesInput = document.getElementById("notes");
const searchInput = document.getElementById("search");
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

let sessions = [];
let isAdmin = false;
let adminSecret = "";
let editingSessionId = null;
let isApiAvailable = true;
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
    if (!saved) {
      return null;
    }

    return JSON.parse(saved);
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
    durationInput,
    statusInput,
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
        "Shared session storage is unavailable. Check the Vercel storage setup.";
    } else if (isAdmin) {
      editorNote.textContent =
        editingSessionId !== null
          ? "Admin mode enabled. You are editing a live session."
          : "Admin mode enabled. Changes are saved for every viewer.";
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

  form.classList.toggle("is-readonly", !canEdit);

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
  const total = sessions.length;
  const completed = sessions.filter(
    (session) => session.status === "Completed",
  ).length;
  const planned = sessions.filter(
    (session) => session.status === "Planned",
  ).length;
  const inProgress = sessions.filter(
    (session) => session.status === "In Progress",
  ).length;

  statsContainer.innerHTML = `
    <div class="stat-card">
      <div>Total</div>
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
  const searchTerm = searchInput.value.trim().toLowerCase();
  const visibleSessions = sessions.filter((session) => {
    const haystack =
      `${session.title} ${session.notes} ${session.status}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  if (!visibleSessions.length) {
    listContainer.innerHTML =
      '<div class="empty-state">No sessions found. Admins can add one from the panel on the left.</div>';
    return;
  }

  listContainer.innerHTML = visibleSessions
    .map((session) => {
      const statusClass =
        session.status === "Completed"
          ? "completed"
          : session.status === "In Progress"
            ? "progress"
            : "danger";
      const updatedLabel = session.updatedAt
        ? `Updated ${formatDateTime(session.updatedAt)}`
        : "Shared live session";
      const actionsMarkup = isAdmin
        ? `
            <div class="card-actions">
              <button data-action="edit" data-id="${session.id}">Edit</button>
              <button data-action="toggle" data-id="${session.id}">Toggle status</button>
              <button class="secondary" data-action="delete" data-id="${session.id}">Delete</button>
            </div>
          `
        : '<p class="read-only-note">View only. Admin updates are published to everyone.</p>';

      return `
        <article class="session-card">
          <div class="session-top">
            <div>
              <div class="session-title">${escapeHtml(session.title)}</div>
              <div class="session-meta">${formatDate(session.date)} • ${session.duration} min</div>
            </div>
            <div class="badge ${statusClass}">${escapeHtml(session.status)}</div>
          </div>
          <div class="session-badges">
            <span class="badge">${formatDate(session.date)}</span>
            <span class="badge">${session.duration} min</span>
            <span class="badge badge-muted">${updatedLabel}</span>
          </div>
          ${session.notes ? `<p class="session-meta session-notes">${escapeHtml(session.notes)}</p>` : ""}
          ${actionsMarkup}
        </article>
      `;
    })
    .join("");
}

function render() {
  renderStats();
  renderSessions();
  updateAdminUI();
}

function resetForm() {
  editingSessionId = null;
  form.reset();
  durationInput.value = "30";
  statusInput.value = "Planned";
  dateInput.value = new Date().toISOString().slice(0, 10);
  updateAdminUI();
}

function fillForm(session) {
  editingSessionId = session.id;
  titleInput.value = session.title;
  dateInput.value = session.date;
  durationInput.value = String(session.duration);
  statusInput.value = session.status;
  notesInput.value = session.notes ?? "";
  updateAdminUI();
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function fetchSessions(showStatus = true) {
  try {
    const response = await fetch(API_URL, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const payload = await parseJson(response);
    sessions = Array.isArray(payload?.sessions)
      ? payload.sessions.sort((a, b) => a.date.localeCompare(b.date))
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
  const response = await fetch(id ? `${API_URL}?id=${encodeURIComponent(id)}` : API_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJson(response).catch(() => null);

  if (!response.ok) {
    const message = payload?.error || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function escapeHtml(value) {
  return String(value)
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

function formatDateTime(value) {
  const parsed = new Date(value);
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin || !isApiAvailable) {
    return;
  }

  const sessionPayload = {
    id: editingSessionId ?? generateId(),
    title: titleInput.value.trim(),
    date: dateInput.value,
    duration: Number(durationInput.value),
    status: statusInput.value,
    notes: notesInput.value.trim(),
  };

  if (!sessionPayload.title || !sessionPayload.date) {
    return;
  }

  formAction.disabled = true;
  updateSyncStatus("Saving changes");

  try {
    const payload = await sendSessionRequest("POST", sessionPayload);
    sessions = payload.sessions;
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

clearAllButton.addEventListener("click", async () => {
  if (!isAdmin || !isApiAvailable) {
    return;
  }

  const confirmed = globalThis.confirm(
    "Delete every session from the shared schedule?",
  );
  if (!confirmed) {
    return;
  }

  try {
    const payload = await sendSessionRequest("PUT", { sessions: [] });
    sessions = payload.sessions;
    resetForm();
    updateSyncStatus("All sessions removed");
    render();
  } catch (error) {
    console.error(error);
    updateSyncStatus(error.message, "error");
  }
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
});

searchInput.addEventListener("input", render);

adminForm.addEventListener("submit", async (event) => {
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
      headers: {
        "Content-Type": "application/json",
      },
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

adminLogoutButton.addEventListener("click", () => {
  setAdminState(false);
  resetForm();
  updateSyncStatus(lastSyncLabel, isApiAvailable ? "muted" : "error");
});

listContainer.addEventListener("click", async (event) => {
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
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "toggle") {
    const nextStatus =
      session.status === "Completed" ? "Planned" : "Completed";

    try {
      const payload = await sendSessionRequest("POST", {
        ...session,
        status: nextStatus,
      });
      sessions = payload.sessions;
      updateSyncStatus("Session updated");
      render();
    } catch (error) {
      console.error(error);
      updateSyncStatus(error.message, "error");
    }
  }

  if (action === "delete") {
    const confirmed = globalThis.confirm(
      `Delete "${session.title}" from the shared schedule?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const payload = await sendSessionRequest("DELETE", null, id);
      sessions = payload.sessions;
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
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  const savedAdmin = getAdminSession();
  if (savedAdmin?.secret) {
    try {
      const response = await fetch(ADMIN_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
