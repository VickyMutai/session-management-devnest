const STORAGE_KEY = "session-manager-state";
const ADMIN_STORAGE_KEY = "afrihealth-admin-state";
const ADMIN_CODE = "afrihealth2026";

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

const sampleSessions = [
  {
    id: crypto.randomUUID(),
    title: "Challenge kickoff",
    date: new Date().toISOString().slice(0, 10),
    duration: 45,
    status: "Planned",
    notes: "Launch the Afrihealth Innovation Challenge agenda.",
  },
  {
    id: crypto.randomUUID(),
    title: "Innovation review",
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    duration: 30,
    status: "In Progress",
    notes: "Review standout ideas and implementation plans.",
  },
];

let sessions = loadSessions();
let isAdmin = localStorage.getItem(ADMIN_STORAGE_KEY) === "true";

function loadSessions() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return sampleSessions;
  }

  try {
    return JSON.parse(saved);
  } catch {
    return sampleSessions;
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function render() {
  renderStats();
  renderSessions();
  updateAdminUI();
}

function updateAdminUI() {
  const submitButton = form.querySelector('button[type="submit"]');
  const controls = [
    titleInput,
    dateInput,
    durationInput,
    statusInput,
    notesInput,
    clearAllButton,
    submitButton,
  ].filter(Boolean);

  controls.forEach((control) => {
    control.disabled = !isAdmin;
  });

  if (editorNote) {
    editorNote.textContent = isAdmin
      ? "Admin mode enabled. You can add or update event details."
      : "Admin access is required to add or change event details.";
  }

  if (adminStatus) {
    adminStatus.textContent = isAdmin
      ? "Admin access active"
      : "Admin access required";
    adminStatus.classList.toggle("active", isAdmin);
  }

  if (adminCodeInput) {
    adminCodeInput.value = "";
  }

  form.classList.toggle("is-readonly", !isAdmin);
}

function renderStats() {
  const total = sessions.length;
  const completed = sessions.filter(
    (session) => session.status === "Completed",
  ).length;
  const planned = sessions.filter(
    (session) => session.status === "Planned",
  ).length;

  statsContainer.innerHTML = `
    <div class="stat-card">
      <div>Total</div>
      <div class="stat-number">${total}</div>
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
    const haystack = `${session.title} ${session.notes}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  if (!visibleSessions.length) {
    listContainer.innerHTML =
      '<div class="empty-state">No sessions found. Add one to get started.</div>';
    return;
  }

  listContainer.innerHTML = visibleSessions
    .map((session) => {
      const statusClass =
        session.status === "Completed"
          ? "completed"
          : session.status === "In Progress"
            ? ""
            : "danger";
      const actionsMarkup = isAdmin
        ? `
            <div class="card-actions">
              <button data-action="toggle" data-id="${session.id}">Toggle status</button>
              <button class="secondary" data-action="delete" data-id="${session.id}">Delete</button>
            </div>
          `
        : '<p class="read-only-note">Admin access required to change this event.</p>';

      return `
        <article class="session-card">
          <div class="session-top">
            <div>
              <div class="session-title">${session.title}</div>
              <div class="session-meta">${formatDate(session.date)} • ${session.duration} min</div>
            </div>
            <div class="badge ${statusClass}">${session.status}</div>
          </div>
          <div class="session-badges">
            <span class="badge">${formatDate(session.date)}</span>
            <span class="badge">${session.duration} min</span>
          </div>
          ${session.notes ? `<p class="session-meta" style="margin-top:10px;">${session.notes}</p>` : ""}
          ${actionsMarkup}
        </article>
      `;
    })
    .join("");
}

function formatDate(date) {
  const parsed = new Date(date + "T00:00:00");
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!isAdmin) {
    if (adminStatus) {
      adminStatus.textContent = "Admin access required";
      adminStatus.classList.remove("active");
    }
    return;
  }

  const newSession = {
    id: crypto.randomUUID(),
    title: titleInput.value.trim(),
    date: dateInput.value,
    duration: Number(durationInput.value),
    status: statusInput.value,
    notes: notesInput.value.trim(),
  };

  if (!newSession.title || !newSession.date) {
    return;
  }

  sessions.unshift(newSession);
  saveSessions();
  form.reset();
  durationInput.value = "30";
  statusInput.value = "Planned";
  dateInput.value = new Date().toISOString().slice(0, 10);
  render();
});

clearAllButton.addEventListener("click", () => {
  if (!isAdmin) {
    return;
  }

  sessions = [];
  saveSessions();
  render();
});

searchInput.addEventListener("input", render);

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const enteredCode = adminCodeInput.value.trim();
  if (enteredCode === ADMIN_CODE) {
    isAdmin = true;
    localStorage.setItem(ADMIN_STORAGE_KEY, "true");
    render();
    return;
  }

  isAdmin = false;
  localStorage.setItem(ADMIN_STORAGE_KEY, "false");
  render();
});

adminLogoutButton.addEventListener("click", () => {
  isAdmin = false;
  localStorage.setItem(ADMIN_STORAGE_KEY, "false");
  render();
});

listContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !isAdmin) {
    return;
  }

  const { action, id } = button.dataset;
  if (action === "toggle") {
    sessions = sessions.map((session) => {
      if (session.id === id) {
        const nextStatus =
          session.status === "Completed" ? "Planned" : "Completed";
        return { ...session, status: nextStatus };
      }
      return session;
    });
    saveSessions();
    render();
  }

  if (action === "delete") {
    sessions = sessions.filter((session) => session.id !== id);
    saveSessions();
    render();
  }
});

// initialize
if (!dateInput.value) {
  dateInput.value = new Date().toISOString().slice(0, 10);
}
render();
