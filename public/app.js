const state = {
  user: null,
  protocols: [],
  users: [],
  currentProtocol: null,
  draggedAgendaId: null,
  protocolSearch: "",
  selectedUserId: null,
  currentView: "dashboard",
};

const fieldIds = [
  "meetingTitle",
  "meetingDate",
  "meetingLocation",
  "meetingRecorder",
  "meetingStart",
  "meetingEnd",
  "attendees",
  "meetingIntro",
];

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const dashboardView = document.getElementById("dashboardView");
const protocolView = document.getElementById("protocolView");
const usersView = document.getElementById("usersView");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const statusNode = document.getElementById("status");
const protocolList = document.getElementById("protocolList");
const protocolSearchInput = document.getElementById("protocolSearch");
const userList = document.getElementById("userList");
const userForm = document.getElementById("userForm");
const userStatus = document.getElementById("userStatus");
const userManageForm = document.getElementById("userManageForm");
const manageUserIdSelect = document.getElementById("manageUserId");
const manageUserStatus = document.getElementById("manageUserStatus");
const currentUserNode = document.getElementById("currentUser");
const editorHeading = document.getElementById("editorHeading");
const protocolMeta = document.getElementById("protocolMeta");
const previewContent = document.getElementById("previewContent");
const readerProtocolPanel = document.getElementById("readerProtocolPanel");
const readerAgendaPanel = document.getElementById("readerAgendaPanel");
const readerProtocolTitle = document.getElementById("readerProtocolTitle");
const readerProtocolMeta = document.getElementById("readerProtocolMeta");
const readerAttendeesBlock = document.getElementById("readerAttendeesBlock");
const readerAttendees = document.getElementById("readerAttendees");
const readerIntroBlock = document.getElementById("readerIntroBlock");
const readerIntro = document.getElementById("readerIntro");
const readerAgendaList = document.getElementById("readerAgendaList");
const printTitle = document.getElementById("printTitle");
const printContent = document.getElementById("printContent");
const dashboardStats = document.getElementById("dashboardStats");
const recentProtocols = document.getElementById("recentProtocols");
const agendaList = document.getElementById("agendaList");
const agendaTemplate = document.getElementById("agendaEditorTemplate");
const importFileInput = document.getElementById("importFile");
const readerActions = document.getElementById("readerActions");
const navDashboard = document.getElementById("navDashboard");
const navProtocol = document.getElementById("navProtocol");
const navUsers = document.getElementById("navUsers");

function isAdmin() {
  return state.user?.role === "admin";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Unbekannter Fehler.");
  }
  return data;
}

function setStatus(message, target = statusNode) {
  target.textContent = message;
}

function getFieldValue(id) {
  return document.getElementById(id).value.trim();
}

function setFieldValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

function parseLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function generateLocalId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankProtocol() {
  return {
    id: null,
    title: "",
    meetingDate: "",
    location: "",
    recorder: "",
    startTime: "",
    endTime: "",
    attendees: "",
    intro: "",
    agenda: [
      {
        localId: generateLocalId(),
        id: null,
        position: 1,
        title: "",
        owner: "",
        notes: "",
        decision: "",
        comments: [],
      },
    ],
  };
}

function hydrateProtocol(protocol) {
  return {
    ...createBlankProtocol(),
    ...protocol,
    agenda: (protocol.agenda || []).map((item) => ({
      localId: item.localId || generateLocalId(),
      comments: [],
      ...item,
    })),
  };
}

function formatDate(value) {
  return value || "ohne Datum";
}

function formatRole(role) {
  return role === "admin" ? "Admin" : "Leser";
}

function setView(viewName) {
  state.currentView = viewName;
  dashboardView.classList.toggle("hidden", viewName !== "dashboard");
  protocolView.classList.toggle("hidden", viewName !== "protocol");
  usersView.classList.toggle("hidden", viewName !== "users" || !isAdmin());
  navProtocol.classList.toggle("hidden", !state.currentProtocol);
  navUsers.classList.toggle("hidden", !isAdmin());
}

function renderAuthState() {
  authView.classList.toggle("hidden", Boolean(state.user));
  appView.classList.toggle("hidden", !state.user);

  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !isAdmin());
  });
  readerActions.classList.toggle("hidden", !state.user || isAdmin());

  currentUserNode.textContent = state.user
    ? `${state.user.displayName} (${formatRole(state.user.role)})`
    : "";

  fieldIds.forEach((id) => {
    document.getElementById(id).disabled = !isAdmin();
  });
}

function filteredProtocols() {
  const query = state.protocolSearch.trim().toLowerCase();
  if (!query) {
    return state.protocols;
  }

  return state.protocols.filter((protocol) => {
    const haystack = [
      protocol.title,
      protocol.location,
      protocol.meetingDate,
      protocol.recorder,
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function renderProtocolList() {
  protocolList.innerHTML = "";
  const visibleProtocols = filteredProtocols();

  if (!visibleProtocols.length) {
    protocolList.innerHTML = `<p class="meta">${
      state.protocolSearch ? "Keine Treffer für die aktuelle Suche." : "Noch keine Protokolle vorhanden."
    }</p>`;
    return;
  }

  visibleProtocols.forEach((protocol) => {
    const item = document.createElement("article");
    item.className = "protocol-item";
    if (state.currentProtocol?.id === protocol.id) {
      item.classList.add("active");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <div class="protocol-title">${escapeHtml(protocol.title)}</div>
      <div class="protocol-meta">${escapeHtml(formatDate(protocol.meetingDate))} · ${escapeHtml(protocol.location || "ohne Ort")}</div>
      <div class="protocol-meta">${protocol.agendaCount || 0} Punkte · ${protocol.commentCount || 0} Kommentare</div>
    `;
    button.addEventListener("click", () => loadProtocol(protocol.id));
    item.appendChild(button);
    protocolList.appendChild(item);
  });
}

function renderDashboard() {
  const totalProtocols = state.protocols.length;
  const totalComments = state.protocols.reduce((sum, protocol) => sum + (protocol.commentCount || 0), 0);
  const latestProtocol = [...state.protocols].sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  )[0];

  dashboardStats.innerHTML = "";
  [
    { label: "Protokolle", value: totalProtocols },
    { label: "Kommentare", value: totalComments },
    { label: "Benutzer", value: isAdmin() ? state.users.length : "sichtbar" },
    { label: "Letztes Update", value: latestProtocol?.meetingDate || "-" },
  ].forEach((stat) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-value">${escapeHtml(String(stat.value))}</div>
      <div class="meta">${escapeHtml(stat.label)}</div>
    `;
    dashboardStats.appendChild(card);
  });

  recentProtocols.innerHTML = "";
  const recent = [...state.protocols]
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 5);

  if (!recent.length) {
    recentProtocols.innerHTML = '<p class="meta">Noch keine Protokolle vorhanden.</p>';
    return;
  }

  recent.forEach((protocol) => {
    const item = document.createElement("article");
    item.className = "protocol-item";
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <div class="protocol-title">${escapeHtml(protocol.title)}</div>
      <div class="protocol-meta">${escapeHtml(formatDate(protocol.meetingDate))} · ${escapeHtml(protocol.location || "ohne Ort")}</div>
      <div class="protocol-meta">Zuletzt geändert: ${escapeHtml(protocol.updatedAt || "-")}</div>
    `;
    button.addEventListener("click", () => loadProtocol(protocol.id));
    item.appendChild(button);
    recentProtocols.appendChild(item);
  });
}

function renderManageUserForm() {
  if (!isAdmin()) {
    userManageForm.classList.add("hidden");
    return;
  }

  manageUserIdSelect.innerHTML = '<option value="">Bitte wählen</option>';
  state.users.forEach((user) => {
    const option = document.createElement("option");
    option.value = String(user.id);
    option.textContent = `${user.displayName} (${user.username})`;
    manageUserIdSelect.appendChild(option);
  });

  if (!state.selectedUserId) {
    userManageForm.classList.add("hidden");
    return;
  }

  const user = state.users.find((entry) => entry.id === state.selectedUserId);
  if (!user) {
    userManageForm.classList.add("hidden");
    return;
  }

  manageUserIdSelect.value = String(user.id);
  document.getElementById("manageDisplayName").value = user.displayName;
  document.getElementById("manageRole").value = user.role;
  document.getElementById("manageIsActive").checked = Boolean(user.isActive);
  document.getElementById("managePassword").value = "";
  userManageForm.classList.remove("hidden");
}

function renderUserList() {
  if (!isAdmin()) {
    userList.innerHTML = "";
    return;
  }

  userList.innerHTML = "";
  state.users.forEach((user) => {
    const item = document.createElement("article");
    item.className = "user-item";
    item.innerHTML = `
      <div><strong>${escapeHtml(user.displayName)}</strong></div>
      <div class="user-meta">${escapeHtml(user.username)} · ${escapeHtml(formatRole(user.role))} · ${user.isActive ? "aktiv" : "deaktiviert"}</div>
    `;
    userList.appendChild(item);
  });

  renderManageUserForm();
}

function updateAgendaNumbers() {
  [...agendaList.querySelectorAll(".agenda-card")].forEach((card, index) => {
    card.querySelector(".agenda-number").textContent = `Tagesordnungspunkt ${index + 1}`;
  });
}

function getCurrentDraft() {
  return {
    ...state.currentProtocol,
    title: getFieldValue("meetingTitle"),
    meetingDate: getFieldValue("meetingDate"),
    location: getFieldValue("meetingLocation"),
    recorder: getFieldValue("meetingRecorder"),
    startTime: getFieldValue("meetingStart"),
    endTime: getFieldValue("meetingEnd"),
    attendees: getFieldValue("attendees"),
    intro: getFieldValue("meetingIntro"),
    agenda: [...agendaList.querySelectorAll(".agenda-card")].map((card, index) => ({
      localId: card.dataset.localId,
      id: card.dataset.id ? Number(card.dataset.id) : null,
      position: index + 1,
      title: card.querySelector(".agenda-title").value.trim(),
      owner: card.querySelector(".agenda-owner").value.trim(),
      notes: card.querySelector(".agenda-notes").value.trim(),
      decision: card.querySelector(".agenda-decision").value.trim(),
      comments: state.currentProtocol?.agenda.find((item) => item.localId === card.dataset.localId)?.comments || [],
    })),
  };
}

function renderPreview() {
  const protocol = getCurrentDraft();
  const attendees = parseLines(protocol.attendees);
  const lines = [
    `# ${protocol.title || "Sitzungsprotokoll"}`,
    "",
    `- Datum: ${protocol.meetingDate || "-"}`,
    `- Ort: ${protocol.location || "-"}`,
    `- Aufgestellt von: ${protocol.recorder || "-"}`,
    `- Beginn: ${protocol.startTime || "-"}`,
    `- Ende: ${protocol.endTime || "-"}`,
    `- Anwesende: ${attendees.length ? attendees.join(", ") : "-"}`,
  ];

  if (protocol.intro) {
    lines.push("", "## Anlass", "", protocol.intro);
  }

  lines.push("", "## Tagesordnungspunkte", "");
  const agenda = protocol.agenda.filter((item) => item.title || item.owner || item.notes || item.decision);
  if (!agenda.length) {
    lines.push("Noch keine Punkte erfasst.");
  } else {
    agenda.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title || "Ohne Titel"}`);
      lines.push("");
      parseLines(item.notes).forEach((entry) => {
        lines.push(entry.startsWith("-") ? entry : `- ${entry}`);
      });
      if (item.decision) {
        if (item.notes) {
          lines.push("");
        }
        lines.push(`Beschluss/Ergebnis: ${item.decision}`);
      }
      if (item.owner) {
        lines.push(`Verantwortlich: ${item.owner}`);
      }
      lines.push("");
    });
  }

  previewContent.textContent = `${lines.join("\n").trim()}\n`;
  printTitle.textContent = protocol.title || "Sitzungsprotokoll";
  printContent.textContent = previewContent.textContent;
}

function buildPrintDocument(protocol) {
  const attendees = parseLines(protocol.attendees);
  const agenda = protocol.agenda.filter((item) =>
    item.title || item.owner || item.notes || item.decision
  );

  const agendaHtml = agenda.length
    ? agenda
        .map((item, index) => {
          const notes = parseLines(item.notes)
            .map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`)
            .join("");

          return `
            <section class="print-topic">
              <h3>${index + 1}. ${escapeHtml(item.title || "Ohne Titel")}</h3>
              ${notes ? `<ul class="topic-notes">${notes}</ul>` : ""}
              ${item.decision ? `<p class="topic-decision"><strong>Beschluss:</strong> ${escapeHtml(item.decision)}</p>` : ""}
              ${item.owner ? `<p class="topic-owner"><strong>Verantwortlich:</strong> ${escapeHtml(item.owner)}</p>` : ""}
            </section>
          `;
        })
        .join("")
    : `<p>Keine Tagesordnungspunkte erfasst.</p>`;

  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(protocol.title || "Sitzungsprotokoll")}</title>
      <style>
        body {
          margin: 0;
          color: #1d1d1d;
          font-family: "Georgia", "Times New Roman", serif;
          font-size: 12pt;
          line-height: 1.45;
          background: #fff;
        }
        .sheet {
          max-width: 190mm;
          margin: 0 auto;
          padding: 16mm 14mm 18mm;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16mm;
          margin-bottom: 12mm;
        }
        .header h1 {
          margin: 0 0 4mm;
          font-size: 20pt;
          line-height: 1.15;
        }
        .subtitle {
          margin: 0;
          font-size: 11pt;
        }
        .logo {
          width: 42mm;
          height: auto;
          object-fit: contain;
          flex: 0 0 auto;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 34mm 1fr;
          gap: 2mm 5mm;
          margin-bottom: 8mm;
        }
        .meta-label {
          font-weight: 700;
        }
        .attendees {
          margin-bottom: 10mm;
        }
        .attendees strong,
        .section-title {
          display: block;
          margin-bottom: 2mm;
        }
        .topic-list {
          display: grid;
          gap: 8mm;
        }
        .print-topic {
          page-break-inside: avoid;
        }
        .print-topic h3 {
          margin: 0 0 3mm;
          font-size: 13pt;
        }
        .topic-notes,
        .topic-comments ul {
          margin: 0 0 3mm 6mm;
          padding: 0;
        }
        .topic-notes li,
        .topic-comments li {
          margin-bottom: 1.2mm;
        }
        .topic-decision,
        .topic-owner,
        .topic-comments p,
        .intro {
          margin: 0 0 3mm;
        }
        @page {
          size: A4;
          margin: 14mm;
        }
      </style>
      <script>
        window.addEventListener("load", () => {
          setTimeout(() => window.print(), 200);
        });
      </script>
    </head>
    <body>
      <main class="sheet">
        <header class="header">
          <div>
            <h1>${escapeHtml(protocol.title || "Sitzungsprotokoll")}</h1>
            <p class="subtitle">Protokoll einer Sitzung</p>
          </div>
          <img class="logo" src="${new URL("./logo.jpg", window.location.href).href}" alt="SSV Jeddeloh II Logo">
        </header>

        <section class="meta-grid">
          <div class="meta-label">Datum:</div><div>${escapeHtml(protocol.meetingDate || "-")}</div>
          <div class="meta-label">Ort:</div><div>${escapeHtml(protocol.location || "-")}</div>
          <div class="meta-label">Aufgestellt:</div><div>${escapeHtml(protocol.recorder || "-")}</div>
          <div class="meta-label">Beginn:</div><div>${escapeHtml(protocol.startTime || "-")}</div>
          <div class="meta-label">Ende:</div><div>${escapeHtml(protocol.endTime || "-")}</div>
        </section>

        <section class="attendees">
          <strong>Anwesend:</strong>
          <div>${attendees.length ? escapeHtml(attendees.join(", ")) : "-"}</div>
        </section>

        ${
          protocol.intro
            ? `<section class="intro"><span class="section-title">Anlass</span>${escapeHtml(protocol.intro)}</section>`
            : ""
        }

        <section class="topic-list">
          ${agendaHtml}
        </section>
      </main>
    </body>
    </html>
  `;
}

function setEditorReadOnly(readOnly) {
  document.querySelectorAll("#editorPanel input, #editorPanel textarea").forEach((node) => {
    node.readOnly = readOnly;
    node.disabled = readOnly;
  });
}

function canManageComment(comment) {
  return Boolean(
    state.user &&
    (state.user.role === "admin" || state.user.id === comment.author.id)
  );
}

function renderReaderProtocol() {
  const protocol = state.currentProtocol || createBlankProtocol();
  readerProtocolTitle.textContent = protocol.title || "Sitzungsprotokoll";

  const metaRows = [
    ["Datum", protocol.meetingDate || "-"],
    ["Ort", protocol.location || "-"],
    ["Aufgestellt", protocol.recorder || "-"],
    ["Beginn", protocol.startTime || "-"],
    ["Ende", protocol.endTime || "-"],
  ];

  readerProtocolMeta.innerHTML = metaRows
    .map(
      ([label, value]) => `
        <div class="reader-meta-label">${escapeHtml(label)}:</div>
        <div>${escapeHtml(value)}</div>
      `
    )
    .join("");

  const attendees = parseLines(protocol.attendees);
  readerAttendeesBlock.classList.toggle("hidden", !attendees.length);
  readerAttendees.textContent = attendees.join(", ");

  readerIntroBlock.classList.toggle("hidden", !protocol.intro);
  readerIntro.textContent = protocol.intro || "";

  const agenda = protocol.agenda.filter((item) =>
    item.title || item.owner || item.notes || item.decision || item.comments?.length
  );

  readerAgendaList.innerHTML = "";
  if (!agenda.length) {
    readerAgendaList.innerHTML = '<p class="meta">Noch keine Tagesordnungspunkte erfasst.</p>';
    return;
  }

  agenda.forEach((item, index) => {
    const notes = parseLines(item.notes)
      .map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`)
      .join("");

    const article = document.createElement("article");
    article.className = "reader-agenda-item";
    article.innerHTML = `
      <h3>${index + 1}. ${escapeHtml(item.title || "Ohne Titel")}</h3>
      ${notes ? `<ul class="reader-notes">${notes}</ul>` : ""}
      ${item.decision ? `<p><strong>Beschluss:</strong> ${escapeHtml(item.decision)}</p>` : ""}
      ${item.owner ? `<p><strong>Verantwortlich:</strong> ${escapeHtml(item.owner)}</p>` : ""}
      <section class="comments reader-comments">
        <h4>Kommentare</h4>
        <div class="comment-list"></div>
        <form class="comment-form">
          <textarea class="comment-input" rows="2" placeholder="Kommentar zu diesem Punkt"></textarea>
          <button class="secondary small" type="submit">Kommentar speichern</button>
        </form>
      </section>
    `;
    readerAgendaList.appendChild(article);
    renderComments(article, item);
  });
}

function renderComments(card, agendaItem) {
  const commentList = card.querySelector(".comment-list");
  commentList.innerHTML = "";

  if (!agendaItem.comments?.length) {
    commentList.innerHTML = '<p class="meta">Noch keine Kommentare.</p>';
  } else {
    agendaItem.comments.forEach((comment) => {
      const item = document.createElement("article");
      item.className = "comment";
      const actions = canManageComment(comment)
        ? `
          <div class="comment-actions">
            <button class="icon-button edit-comment" type="button" title="Kommentar bearbeiten" aria-label="Kommentar bearbeiten">Bearbeiten</button>
            <button class="icon-button danger delete-comment" type="button" title="Kommentar löschen" aria-label="Kommentar löschen">🗑</button>
          </div>
        `
        : "";
      item.innerHTML = `
        <div class="comment-head">
          <div class="comment-meta">${escapeHtml(comment.author.displayName)} · ${escapeHtml(comment.createdAt)}</div>
          ${actions}
        </div>
        <div class="comment-body">${escapeHtml(comment.body)}</div>
      `;

      if (canManageComment(comment)) {
        item.querySelector(".edit-comment").addEventListener("click", async () => {
          const nextBody = window.prompt("Kommentar bearbeiten:", comment.body);
          if (nextBody === null) {
            return;
          }

          const trimmed = nextBody.trim();
          if (!trimmed) {
            setStatus("Kommentartext darf nicht leer sein.");
            return;
          }

          try {
            const data = await api(`/api/comments/${comment.id}`, {
              method: "PATCH",
              body: { body: trimmed },
            });
            state.currentProtocol = hydrateProtocol(data.protocol);
            syncFieldsFromProtocol();
            renderAgenda();
            renderPreview();
            await refreshProtocols();
            setStatus("Kommentar aktualisiert.");
          } catch (error) {
            setStatus(error.message);
          }
        });

        item.querySelector(".delete-comment").addEventListener("click", async () => {
          const confirmed = window.confirm("Wollen Sie wirklich diesen Kommentar löschen?");
          if (!confirmed) {
            return;
          }

          try {
            const data = await api(`/api/comments/${comment.id}`, {
              method: "DELETE",
            });
            state.currentProtocol = hydrateProtocol(data.protocol);
            syncFieldsFromProtocol();
            renderAgenda();
            renderPreview();
            await refreshProtocols();
            setStatus("Kommentar gelöscht.");
          } catch (error) {
            setStatus(error.message);
          }
        });
      }

      commentList.appendChild(item);
    });
  }

  const form = card.querySelector(".comment-form");
  if (!agendaItem.id || !state.currentProtocol?.id) {
    form.classList.add("hidden");
    return;
  }

  form.classList.remove("hidden");
  const input = form.querySelector(".comment-input");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) {
      return;
    }

    try {
      const data = await api("/api/comments", {
        method: "POST",
        body: {
          protocolId: state.currentProtocol.id,
          agendaItemId: agendaItem.id,
          body,
        },
      });
      state.currentProtocol = hydrateProtocol(data.protocol);
      syncFieldsFromProtocol();
      renderAgenda();
      renderPreview();
      await refreshProtocols();
      setStatus("Kommentar gespeichert.");
    } catch (error) {
      setStatus(error.message);
    }
  });
}

function createAgendaCard(agendaItem) {
  const fragment = agendaTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".agenda-card");

  card.dataset.localId = agendaItem.localId;
  if (agendaItem.id) {
    card.dataset.id = String(agendaItem.id);
  }

  const title = card.querySelector(".agenda-title");
  const owner = card.querySelector(".agenda-owner");
  const notes = card.querySelector(".agenda-notes");
  const decision = card.querySelector(".agenda-decision");

  title.value = agendaItem.title || "";
  owner.value = agendaItem.owner || "";
  notes.value = agendaItem.notes || "";
  decision.value = agendaItem.decision || "";

  const removable = card.querySelector(".remove-item");
  if (!isAdmin()) {
    card.draggable = false;
    card.querySelector(".drag-handle").classList.add("hidden");
    removable.classList.add("hidden");
    [title, owner, notes, decision].forEach((node) => {
      node.readOnly = true;
      node.disabled = true;
    });
  } else {
    [title, owner, notes, decision].forEach((node) => {
      node.addEventListener("input", renderPreview);
    });

    removable.addEventListener("click", () => {
      card.remove();
      if (!agendaList.children.length) {
        state.currentProtocol.agenda = [hydrateProtocol(createBlankProtocol()).agenda[0]];
        renderAgenda();
      }
      updateAgendaNumbers();
      renderPreview();
    });

    card.addEventListener("dragstart", () => {
      state.draggedAgendaId = card.dataset.localId;
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      state.draggedAgendaId = null;
      agendaList.querySelectorAll(".agenda-card").forEach((node) => node.classList.remove("dragging", "drag-over"));
      updateAgendaNumbers();
      renderPreview();
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    card.addEventListener("dragenter", () => {
      if (state.draggedAgendaId && state.draggedAgendaId !== card.dataset.localId) {
        card.classList.add("drag-over");
      }
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const dragged = agendaList.querySelector(`[data-local-id="${state.draggedAgendaId}"]`);
      if (!dragged || dragged === card) {
        return;
      }
      const cards = [...agendaList.querySelectorAll(".agenda-card")];
      const draggedIndex = cards.indexOf(dragged);
      const targetIndex = cards.indexOf(card);
      if (draggedIndex < targetIndex) {
        card.after(dragged);
      } else {
        card.before(dragged);
      }
      updateAgendaNumbers();
      renderPreview();
    });
  }

  renderComments(card, agendaItem);
  agendaList.appendChild(fragment);
}

function renderAgenda() {
  agendaList.innerHTML = "";
  const agenda = state.currentProtocol?.agenda?.length
    ? state.currentProtocol.agenda
    : hydrateProtocol(createBlankProtocol()).agenda;
  agenda.forEach((item) => createAgendaCard(item));
  updateAgendaNumbers();
}

function syncFieldsFromProtocol() {
  const protocol = state.currentProtocol || createBlankProtocol();
  setFieldValue("meetingTitle", protocol.title);
  setFieldValue("meetingDate", protocol.meetingDate);
  setFieldValue("meetingLocation", protocol.location);
  setFieldValue("meetingRecorder", protocol.recorder);
  setFieldValue("meetingStart", protocol.startTime);
  setFieldValue("meetingEnd", protocol.endTime);
  setFieldValue("attendees", protocol.attendees);
  setFieldValue("meetingIntro", protocol.intro);
  editorHeading.textContent = protocol.title || "Neues Protokoll";
  protocolMeta.textContent = protocol.updatedAt ? `Zuletzt gespeichert: ${protocol.updatedAt}` : "Noch nicht gespeichert";
}

function renderProtocol() {
  if (!state.currentProtocol) {
    state.currentProtocol = createBlankProtocol();
  }
  syncFieldsFromProtocol();
  renderAgenda();
  renderPreview();
  setEditorReadOnly(!isAdmin());
  document.getElementById("editorPanel").classList.toggle("hidden", !isAdmin());
  document.getElementById("agendaList").parentElement.classList.toggle("hidden", !isAdmin());
  document.querySelector(".preview").classList.toggle("hidden", !isAdmin());
  readerProtocolPanel.classList.toggle("hidden", isAdmin());
  readerAgendaPanel.classList.toggle("hidden", isAdmin());
  if (!isAdmin()) {
    renderReaderProtocol();
  }
}

async function refreshProtocols(selectId) {
  const data = await api("/api/protocols");
  state.protocols = data.protocols;
  renderProtocolList();
  renderDashboard();
  if (selectId) {
    await loadProtocol(selectId);
  }
}

async function refreshUsers() {
  if (!isAdmin()) {
    return;
  }
  const data = await api("/api/users");
  state.users = data.users;
  renderUserList();
  renderDashboard();
}

async function loadProtocol(id) {
  const data = await api(`/api/protocols/${id}`);
  state.currentProtocol = hydrateProtocol(data.protocol);
  renderProtocolList();
  renderProtocol();
  setView("protocol");
}

async function saveProtocol() {
  const draft = getCurrentDraft();
  const body = {
    title: draft.title,
    meetingDate: draft.meetingDate,
    location: draft.location,
    recorder: draft.recorder,
    startTime: draft.startTime,
    endTime: draft.endTime,
    attendees: draft.attendees,
    intro: draft.intro,
    agenda: draft.agenda.map((item) => ({
      id: item.id,
      title: item.title,
      owner: item.owner,
      notes: item.notes,
      decision: item.decision,
    })),
  };

  const path = draft.id ? `/api/protocols/${draft.id}` : "/api/protocols";
  const method = draft.id ? "PUT" : "POST";
  const data = await api(path, { method, body });
  state.currentProtocol = hydrateProtocol(data.protocol);
  await refreshProtocols();
  renderProtocol();
  renderProtocolList();
  setView("protocol");
  setStatus("Protokoll gespeichert.");
}

async function deleteProtocol() {
  if (!state.currentProtocol?.id) {
    state.currentProtocol = createBlankProtocol();
    renderProtocol();
    setView("dashboard");
    setStatus("Ungespeicherten Entwurf verworfen.");
    return;
  }

  await api(`/api/protocols/${state.currentProtocol.id}`, { method: "DELETE" });
  state.currentProtocol = createBlankProtocol();
  await refreshProtocols();
  renderProtocol();
  setView("dashboard");
  setStatus("Protokoll gelöscht.");
}

function buildMarkdownFromState() {
  renderPreview();
  return previewContent.textContent;
}

function downloadMarkdown() {
  const blob = new Blob([buildMarkdownFromState()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateValue = getFieldValue("meetingDate") || "ohne-datum";
  anchor.href = url;
  anchor.download = `protokoll-${dateValue}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Markdown-Datei heruntergeladen.");
}

function parseFieldLine(markdown, label) {
  const match = markdown.match(new RegExp(`^- ${label}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^## ${escaped}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, "m"));
  return match ? match[1].trim() : "";
}

function parseMarkdown(markdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const attendees = parseFieldLine(markdown, "Anwesende");
  const agendaMatch = markdown.match(/^## Tagesordnungspunkte\s*$([\s\S]*)/m);
  const agendaSection = agendaMatch ? agendaMatch[1].trim() : "";
  const agenda = [];

  if (agendaSection) {
    const itemMatches = agendaSection.matchAll(
      /^###\s+\d+\.\s+(.+)\n([\s\S]*?)(?=^###\s+\d+\.\s+|$)/gm
    );

    for (const match of itemMatches) {
      const body = match[2].trim();
      const ownerMatch = body.match(/^Verantwortlich:\s*(.+)$/m);
      const decisionMatch = body.match(/^Beschluss\/Ergebnis:\s*(.+)$/m);
      const noteLines = body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("Verantwortlich:") && !line.startsWith("Beschluss/Ergebnis:") && line !== "Kommentare:");

      agenda.push({
        localId: generateLocalId(),
        id: null,
        position: agenda.length + 1,
        title: match[1].trim(),
        owner: ownerMatch ? ownerMatch[1].trim() : "",
        notes: noteLines.filter((line) => !line.startsWith("- ") || !line.includes(": ")).join("\n"),
        decision: decisionMatch ? decisionMatch[1].trim() : "",
        comments: [],
      });
    }
  }

  return {
    ...createBlankProtocol(),
    title: titleMatch ? titleMatch[1].trim() : "",
    meetingDate: parseFieldLine(markdown, "Datum"),
    location: parseFieldLine(markdown, "Ort"),
    recorder: parseFieldLine(markdown, "Aufgestellt von"),
    startTime: parseFieldLine(markdown, "Beginn"),
    endTime: parseFieldLine(markdown, "Ende"),
    attendees: attendees && attendees !== "-" ? attendees.split(",").map((item) => item.trim()).filter(Boolean).join("\n") : "",
    intro: extractSection(markdown, "Anlass"),
    agenda: agenda.length ? agenda : createBlankProtocol().agenda,
  };
}

function importMarkdownFile(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.currentProtocol = hydrateProtocol(parseMarkdown(String(reader.result || "")));
    renderProtocol();
    setView("protocol");
    setStatus("Markdown geladen. Zum Übernehmen bitte speichern.");
  });
  reader.readAsText(file, "utf-8");
}

function openPrintView() {
  const protocol = getCurrentDraft();
  const html = buildPrintDocument(protocol);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");
  if (!printWindow) {
    setStatus("Druckansicht konnte nicht geöffnet werden.");
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function startNewProtocol() {
  state.currentProtocol = createBlankProtocol();
  renderProtocolList();
  renderProtocol();
  setView("protocol");
  setStatus("Neues Protokoll vorbereitet.");
}

async function bootstrap() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    renderAuthState();

    if (!state.user) {
      state.currentProtocol = createBlankProtocol();
      renderProtocol();
      return;
    }

    await refreshProtocols();
    if (isAdmin()) {
      await refreshUsers();
    }
    state.currentProtocol = createBlankProtocol();
    renderProtocol();
    setView("dashboard");
    renderDashboard();
  } catch (error) {
    renderAuthState();
    setStatus(error.message, loginStatus);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: {
        username: document.getElementById("loginUsername").value,
        password: document.getElementById("loginPassword").value,
      },
    });

    state.user = data.user;
    loginForm.reset();
    setStatus("", loginStatus);
    renderAuthState();
    await refreshProtocols();
    if (isAdmin()) {
      await refreshUsers();
    }
    state.currentProtocol = createBlankProtocol();
    renderProtocol();
    setView("dashboard");
    renderDashboard();
  } catch (error) {
    setStatus(error.message, loginStatus);
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  state.protocols = [];
  state.users = [];
  state.selectedUserId = null;
  state.currentProtocol = createBlankProtocol();
  renderProtocolList();
  renderUserList();
  renderProtocol();
  renderAuthState();
  setStatus("Abgemeldet.", loginStatus);
});

navDashboard.addEventListener("click", () => setView("dashboard"));
navProtocol.addEventListener("click", () => setView("protocol"));
navUsers.addEventListener("click", () => {
  if (isAdmin()) {
    setView("users");
  }
});

document.getElementById("newProtocolButton").addEventListener("click", startNewProtocol);
document.getElementById("dashboardNewProtocol").addEventListener("click", startNewProtocol);
document.getElementById("dashboardUsers").addEventListener("click", () => {
  if (isAdmin()) {
    setView("users");
  }
});

document.getElementById("saveProtocolButton").addEventListener("click", async () => {
  try {
    await saveProtocol();
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("deleteProtocolButton").addEventListener("click", async () => {
  try {
    await deleteProtocol();
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("downloadMarkdown").addEventListener("click", downloadMarkdown);
document.getElementById("importMarkdown").addEventListener("click", () => importFileInput.click());
document.getElementById("printProtocolButton").addEventListener("click", openPrintView);
document.getElementById("printProtocolButtonReader").addEventListener("click", openPrintView);
importFileInput.addEventListener("change", (event) => {
  importMarkdownFile(event.target.files?.[0]);
  event.target.value = "";
});

document.getElementById("addAgendaItem").addEventListener("click", () => {
  state.currentProtocol = getCurrentDraft();
  state.currentProtocol.agenda.push({
    localId: generateLocalId(),
    id: null,
    position: state.currentProtocol.agenda.length + 1,
    title: "",
    owner: "",
    notes: "",
    decision: "",
    comments: [],
  });
  renderAgenda();
  renderPreview();
});

fieldIds.forEach((id) => {
  document.getElementById(id).addEventListener("input", renderPreview);
});

protocolSearchInput.addEventListener("input", (event) => {
  state.protocolSearch = event.target.value;
  renderProtocolList();
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/users", {
      method: "POST",
      body: {
        username: document.getElementById("newUsername").value,
        displayName: document.getElementById("newDisplayName").value,
        password: document.getElementById("newPassword").value,
        role: document.getElementById("newRole").value,
      },
    });
    state.users = data.users;
    renderUserList();
    renderDashboard();
    userForm.reset();
    setStatus("Benutzer angelegt.", userStatus);
  } catch (error) {
    setStatus(error.message, userStatus);
  }
});

manageUserIdSelect.addEventListener("change", (event) => {
  state.selectedUserId = event.target.value ? Number(event.target.value) : null;
  setStatus("", manageUserStatus);
  renderManageUserForm();
});

userManageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedUserId) {
    return;
  }

  try {
    const data = await api(`/api/users/${state.selectedUserId}`, {
      method: "PATCH",
      body: {
        displayName: document.getElementById("manageDisplayName").value,
        role: document.getElementById("manageRole").value,
        isActive: document.getElementById("manageIsActive").checked,
        password: document.getElementById("managePassword").value,
      },
    });
    state.users = data.users;
    renderUserList();
    renderDashboard();
    setStatus("Benutzer aktualisiert.", manageUserStatus);
  } catch (error) {
    setStatus(error.message, manageUserStatus);
  }
});

document.getElementById("deleteManagedUser").addEventListener("click", async () => {
  if (!state.selectedUserId) {
    return;
  }

  try {
    const data = await api(`/api/users/${state.selectedUserId}`, { method: "DELETE" });
    state.users = data.users;
    state.selectedUserId = null;
    renderUserList();
    renderDashboard();
    setStatus("Benutzer gelöscht.", manageUserStatus);
  } catch (error) {
    setStatus(error.message, manageUserStatus);
  }
});

bootstrap();
