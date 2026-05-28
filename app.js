const CHECKLIST_MANIFEST = [
  {
    type: "systematic",
    label: "Systematic review protocol",
    file: "./data/checklists/prisma-p-systematic-review-protocol.json?v=section-elements-3"
  },
  {
    type: "scoping",
    label: "Scoping review protocol",
    file: "./data/checklists/jbi-scoping-review-protocol.json?v=section-elements-3"
  },
  {
    type: "rapid",
    label: "Rapid review protocol",
    file: "./data/checklists/rapid-review-protocol.json?v=section-elements-3"
  },
  {
    type: "egm",
    label: "Evidence and gap map protocol",
    file: "./data/checklists/evidence-gap-map-protocol.json?v=section-elements-3"
  },
  {
    type: "qualitative",
    label: "Qualitative evidence synthesis protocol",
    file: "./data/checklists/qualitative-evidence-synthesis-protocol.json?v=section-elements-3"
  },
  {
    type: "mixed-methods",
    label: "Mixed-methods review protocol",
    file: "./data/checklists/mixed-methods-review-protocol.json?v=section-elements-3"
  },
  {
    type: "umbrella",
    label: "Umbrella review protocol",
    file: "./data/checklists/umbrella-review-protocol.json?v=section-elements-3"
  },
  {
    type: "review-of-reviews",
    label: "Review of reviews protocol",
    file: "./data/checklists/review-of-reviews-protocol.json?v=section-elements-3"
  },
  {
    type: "realist",
    label: "Realist review protocol",
    file: "./data/checklists/realist-review-protocol.json?v=section-elements-3"
  },
  {
    type: "living",
    label: "Living systematic review protocol",
    file: "./data/checklists/living-systematic-review-protocol.json?v=section-elements-3"
  }
];

const STORAGE_KEY = "review-protocol-studio-projects-v1";
const ACCOUNTS_KEY = "review-protocol-studio-accounts-v1";
const SESSION_KEY = "review-protocol-studio-session-v1";
const BACKEND_SESSION_KEY = "review-protocol-studio-backend-session-v1";
const STATUS_OPTIONS = [
  ["incomplete", "Incomplete"],
  ["complete", "Complete"],
  ["needs", "Needs clarification"],
  ["na", "Not applicable"]
];

const app = document.querySelector("#app");
const state = {
  checklists: {},
  backendAvailable: false,
  backendToken: "",
  backendUser: null,
  accounts: [],
  sessionUserId: "",
  projects: [],
  view: "dashboard",
  activeProjectId: null,
  activeSection: null,
  modalOpen: false,
  authMode: "",
  profileOpen: false,
  guidanceOpen: false,
  toast: ""
};

init();

async function init() {
  state.accounts = loadAccounts();
  state.sessionUserId = loadSession();
  await loadChecklists();
  state.backendAvailable = await detectBackend();
  if (state.backendAvailable) {
    await restoreBackendSession();
  } else {
    state.projects = loadProjects();
  }
  render();
}

async function loadChecklists() {
  const entries = await Promise.all(
    CHECKLIST_MANIFEST.map(async (entry) => {
      const response = await fetch(entry.file);
      if (!response.ok) throw new Error(`Unable to load ${entry.file}`);
      const checklist = await response.json();
      return [entry.type, checklist];
    })
  );
  state.checklists = Object.fromEntries(entries);
}

function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProjects() {
  if (state.backendAvailable) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
}

async function persistProject(project, method = "PUT") {
  if (!state.backendAvailable) {
    saveProjects();
    return;
  }
  try {
    await apiRequest(method === "POST" ? "/api/projects" : `/api/projects/${encodeURIComponent(project.id)}`, {
      method,
      body: JSON.stringify(project)
    });
  } catch (error) {
    showToast(`Could not save project: ${error.message}`);
  }
}

async function deleteProjectRemote(id) {
  if (!state.backendAvailable) {
    saveProjects();
    return;
  }
  try {
    await apiRequest(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    showToast(`Could not delete project: ${error.message}`);
  }
}

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAccounts() {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(state.accounts));
}

function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    return session.userId || "";
  } catch {
    return "";
  }
}

function saveSession(userId) {
  state.sessionUserId = userId;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

async function detectBackend() {
  if (location.protocol === "file:") return false;
  try {
    const response = await fetch("./api/health", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function restoreBackendSession() {
  const token = localStorage.getItem(BACKEND_SESSION_KEY) || "";
  if (!token) return;
  state.backendToken = token;
  try {
    const payload = await apiRequest("/api/me");
    state.backendUser = payload.user;
    state.projects = await apiRequest("/api/projects");
  } catch {
    localStorage.removeItem(BACKEND_SESSION_KEY);
    state.backendToken = "";
    state.backendUser = null;
    state.projects = [];
  }
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.backendToken) headers.Authorization = `Bearer ${state.backendToken}`;
  const response = await fetch(path, {
    ...options,
    headers
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function currentUser() {
  if (state.backendAvailable) return state.backendUser;
  return state.accounts.find((account) => account.id === state.sessionUserId);
}

function visibleProjects() {
  const user = currentUser();
  if (!user) return [];
  if (state.backendAvailable) return state.projects;
  return state.projects.filter((project) => project.ownerId === user.id);
}

function render() {
  const project = getActiveProject();
  app.innerHTML = `
    <div class="shell">
      ${topbar(project)}
      <main class="main">
        ${state.view === "builder" && project ? builderView(project) : ""}
        ${state.view === "preview" && project ? previewView(project) : ""}
        ${state.view === "dashboard" ? dashboardView() : ""}
      </main>
      ${state.modalOpen ? projectModal() : ""}
      ${state.authMode ? authModal() : ""}
      ${state.profileOpen ? profileModal() : ""}
      ${state.guidanceOpen ? guidanceModal(project) : ""}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
  bindEvents();
}

function topbar(project) {
  const inProject = Boolean(project);
  const user = currentUser();
  return `
    <header class="topbar">
      <button class="brand" data-action="dashboard" title="Dashboard">
        <img class="brand-logo" src="./public/review-protocol-studio-logo.svg?v=profile-1" alt="Review Protocol Studio" />
        <span class="brand-title">
          <strong>Review Protocol Studio</strong>
          <span>Checklist-guided evidence synthesis protocols</span>
        </span>
      </button>
      <nav class="top-actions" aria-label="Primary actions">
        ${
          inProject
            ? `
              <button class="btn" data-action="builder">Builder</button>
              <button class="btn" data-action="preview">Preview</button>
              <button class="btn" data-action="guidance">Guidance</button>
              <button class="btn" data-action="export-doc">Export Word</button>
              <button class="btn" data-action="export-report">Checklist report</button>
            `
            : `<button class="btn" data-action="guidance">Guidance library</button>`
        }
        ${user ? `<button class="account-chip" data-action="profile" title="Edit profile">${escapeHtml(user.name)}</button>` : `<button class="btn" data-action="show-sign-in">Sign in</button>`}
        ${user ? `<button class="btn" data-action="sign-out">Sign out</button>` : `<button class="btn primary" data-action="show-create-account">Create account</button>`}
        <button class="btn primary" data-action="new-project" ${user ? "" : "disabled"}>New protocol</button>
      </nav>
    </header>
  `;
}

function dashboardView() {
  if (!currentUser()) return accountGate();
  const metrics = dashboardMetrics();
  const projects = visibleProjects();
  return `
    <section class="dashboard">
      <div class="summary-grid">
        <div class="metric"><span>Projects</span><strong>${metrics.total}</strong></div>
        <div class="metric"><span>Average completion</span><strong>${metrics.average}%</strong></div>
        <div class="metric"><span>Ready to export</span><strong>${metrics.ready}</strong></div>
        <div class="metric"><span>Needs review</span><strong>${metrics.needsReview}</strong></div>
      </div>
      <section class="workspace-panel">
        <div class="panel-head">
          <div>
            <h1>Protocol projects</h1>
            <p>Create and manage checklist-guided review protocols.</p>
          </div>
          <button class="btn primary" data-action="new-project">New protocol</button>
        </div>
        ${projects.length ? projectTable(projects) : emptyState()}
      </section>
    </section>
  `;
}

function accountGate() {
  return `
    <section class="account-gate">
      <div>
        <img src="./public/protocol-mark.svg?v=accounts-1" alt="" />
        <h1>Create your Review Protocol Studio account</h1>
        <p>Sign in to keep protocol projects separated by account on this browser.</p>
      </div>
      <div class="account-actions">
        <button class="btn primary" data-action="show-create-account">Create account</button>
        <button class="btn" data-action="show-sign-in">Sign in</button>
      </div>
    </section>
  `;
}

function dashboardMetrics() {
  const summaries = visibleProjects().map(projectSummary);
  const total = summaries.length;
  const average = total ? Math.round(summaries.reduce((sum, item) => sum + item.completion, 0) / total) : 0;
  return {
    total,
    average,
    ready: summaries.filter((item) => item.completion === 100 && item.issueCount === 0).length,
    needsReview: summaries.filter((item) => item.issueCount > 0 || item.completion < 100).length
  };
}

function projectTable(projects) {
  return `
    <table class="project-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Review type</th>
          <th>Lead</th>
          <th>Updated</th>
          <th>Completion</th>
          <th>Status</th>
          <th>Export</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${projects.map(projectRow).join("")}
      </tbody>
    </table>
  `;
}

function projectRow(project) {
  const summary = projectSummary(project);
  return `
    <tr>
      <td class="project-title-cell">
        <strong>${escapeHtml(project.title)}</strong>
        <span>${escapeHtml(project.shortTitle || "No short title")} · Created ${formatDate(project.createdAt)}</span>
      </td>
      <td>${escapeHtml(getChecklist(project.reviewType).label)}</td>
      <td>${escapeHtml(project.lead || "Not set")}</td>
      <td>${formatDate(project.updatedAt)}</td>
      <td>
        <div class="progress" aria-label="${summary.completion}% complete"><div style="width: ${summary.completion}%"></div></div>
        <small>${summary.completion}%</small>
      </td>
      <td>${statusPill(summary.statusLabel, summary.statusClass)}</td>
      <td>${escapeHtml(project.exportedAt ? `Exported ${formatDate(project.exportedAt)}` : "Not exported")}</td>
      <td>
        <div class="row-actions">
          <button class="btn icon" title="Open" data-action="open-project" data-id="${project.id}">↗</button>
          <button class="btn icon" title="Duplicate" data-action="duplicate-project" data-id="${project.id}">⧉</button>
          <button class="btn icon" title="Export Word" data-action="export-doc" data-id="${project.id}">⇩</button>
          <button class="btn icon danger" title="Delete" data-action="delete-project" data-id="${project.id}">×</button>
        </div>
      </td>
    </tr>
  `;
}

function emptyState() {
  return `
    <div class="empty-state">
      <img src="./public/protocol-mark.svg" alt="" />
      <h2>No protocol projects yet</h2>
      <p>Start a project, choose the review type, and the studio will load the matching checklist-guided prompts.</p>
      <button class="btn primary" data-action="new-project">Create first protocol</button>
    </div>
  `;
}

function builderView(project) {
  const checklist = getChecklist(project.reviewType);
  const section = state.activeSection || checklist.sections[0];
  const sectionItems = checklist.items.filter((item) => item.section === section);
  const summary = projectSummary(project);
  return `
    <section class="builder">
      <aside class="sidebar">
        <div class="sidebar-head">
          <strong>${escapeHtml(project.shortTitle || project.title)}</strong>
          <span>${escapeHtml(checklist.framework)}</span>
        </div>
        <div class="section-list">
          ${checklist.sections.map((name) => sectionTab(project, name, name === section)).join("")}
        </div>
      </aside>
      <section class="editor">
        <div class="editor-head">
          <div>
            <h1>${escapeHtml(section)}</h1>
            <p>${sectionItems.length} protocol element${sectionItems.length === 1 ? "" : "s"} in this section</p>
          </div>
          ${statusPill(`${summary.completion}% complete`, summary.completion === 100 ? "complete" : "needs")}
        </div>
        <div class="prompt-stack">
          ${sectionItems.length ? sectionItems.map((item) => promptCard(project, item)).join("") : noSectionItems()}
        </div>
      </section>
      ${inspector(project)}
    </section>
  `;
}

function sectionTab(project, section, active) {
  const checklist = getChecklist(project.reviewType);
  const sectionItems = checklist.items.filter((item) => item.section === section);
  const complete = sectionItems.filter((item) => getItemStatus(project, item) === "complete" || getItemStatus(project, item) === "na").length;
  return `
    <button class="section-tab ${active ? "active" : ""}" data-action="section" data-section="${escapeAttr(section)}">
      <strong>${escapeHtml(section)}</strong>
      <span>${complete}/${sectionItems.length} addressed</span>
    </button>
  `;
}

function promptCard(project, item) {
  const response = project.responses[item.id] || { value: "", status: "incomplete" };
  return `
    <article class="prompt-card" data-item-id="${item.id}">
      <div class="prompt-top">
        <div class="prompt-meta">
          <span class="item-number">${escapeHtml(item.itemNumber)}</span>
          ${item.elementLabel ? `<span class="element-kind">${escapeHtml(item.elementLabel)}</span>` : ""}
          ${item.itemKind ? statusPill("Section element", "na") : statusPill("Checklist-linked", "")}
          ${item.required ? statusPill("Required", "needs") : statusPill("Optional", "na")}
          ${statusPill(statusLabel(getItemStatus(project, item)), statusClass(getItemStatus(project, item)))}
        </div>
        <h2>${escapeHtml(item.prompt)}</h2>
        <p class="requirement">${escapeHtml(item.requirement)}</p>
      </div>
      <div class="prompt-body">
        <div class="hint"><strong>Help:</strong> ${escapeHtml(item.helpText)}<br /><strong>Example:</strong> ${escapeHtml(item.exampleResponse)}</div>
        <label class="field-label">
          <span>Your text for this element</span>
          <textarea data-action="response" data-item-id="${item.id}" placeholder="${escapeAttr(item.exampleResponse)}">${escapeHtml(response.value || "")}</textarea>
        </label>
        <div class="prompt-actions">
          <label class="field-label">
            <span>Element status</span>
            <select data-action="status" data-item-id="${item.id}">
              ${STATUS_OPTIONS.map(([value, label]) => `<option value="${value}" ${getItemStatus(project, item) === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <button class="btn" data-action="use-example" data-item-id="${item.id}">Use example</button>
        </div>
      </div>
    </article>
  `;
}

function noSectionItems() {
  return `<div class="empty-state"><h2>No elements in this section</h2><p>This section will appear in the generated protocol and can be expanded by adding section elements to the JSON file.</p></div>`;
}

function inspector(project) {
  const summary = projectSummary(project);
  const issues = consistencyIssues(project);
  const checklist = getChecklist(project.reviewType);
  const counts = countStatuses(project);
  return `
    <aside class="inspector">
      <div class="inspector-head">
        <strong>Checklist status</strong>
        <span>${escapeHtml(checklist.label)} · ${escapeHtml(checklist.questionFramework)}</span>
      </div>
      <div class="inspector-section">
        <p class="mini-title">Completion</p>
        <div class="progress"><div style="width: ${summary.completion}%"></div></div>
        <p>${summary.completedItems}/${summary.requiredItems} required elements complete</p>
      </div>
      <div class="inspector-section">
        <p class="mini-title">Element states</p>
        <div class="status-list">
          <div class="status-row"><span>Complete</span>${statusPill(String(counts.complete), "complete")}</div>
          <div class="status-row"><span>Incomplete</span>${statusPill(String(counts.incomplete), "needs")}</div>
          <div class="status-row"><span>Needs clarification</span>${statusPill(String(counts.needs), "needs")}</div>
          <div class="status-row"><span>Not applicable</span>${statusPill(String(counts.na), "na")}</div>
        </div>
      </div>
      <div class="inspector-section">
        <p class="mini-title">Consistency checks</p>
        <div class="issue-list">
          ${issues.length ? issues.map((issue) => `<div class="issue">${escapeHtml(issue)}</div>`).join("") : `<div class="hint">No consistency issues detected.</div>`}
        </div>
      </div>
      <div class="inspector-section">
        <p class="mini-title">Guidance sources</p>
        ${sourceList(checklist.sources || [], 3)}
        <button class="btn source-more" data-action="guidance">Open guidance library</button>
      </div>
      <div class="inspector-section">
        <button class="btn primary" data-action="preview">Review protocol preview</button>
      </div>
    </aside>
  `;
}

function previewView(project) {
  return `
    <article class="preview">
      ${protocolHtml(project, false)}
    </article>
  `;
}

function guidanceModal(project) {
  const checklists = project ? [getChecklist(project.reviewType)] : CHECKLIST_MANIFEST.map((item) => getChecklist(item.type));
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal guidance-modal" role="dialog" aria-modal="true" aria-labelledby="guidance-title">
        <div class="modal-head">
          <div>
            <h2 id="guidance-title">Guidance library</h2>
            <p>${project ? escapeHtml(getChecklist(project.reviewType).label) : "Official checklist and methods sources by review type"}</p>
          </div>
          <button class="btn icon" data-action="close-guidance" title="Close">×</button>
        </div>
        <div class="guidance-body">
          <p class="guidance-note">These are authoritative sources used to shape the app prompts. Open the official source when you need the current full checklist, manual text, or licensing terms.</p>
          ${checklists.map(guidanceGroup).join("")}
        </div>
      </section>
    </div>
  `;
}

function guidanceGroup(checklist) {
  return `
    <section class="guidance-group">
      <div>
        <h3>${escapeHtml(checklist.label)}</h3>
        <p>${escapeHtml(checklist.framework)} · ${escapeHtml(checklist.questionFramework)}</p>
      </div>
      ${sourceList(checklist.sources || [], 20)}
    </section>
  `;
}

function authModal() {
  const creating = state.authMode === "create";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="modal-head">
          <div>
            <h2 id="auth-title">${creating ? "Create account" : "Sign in"}</h2>
            <p>${creating ? "Start a workspace for your protocol projects." : "Open your protocol workspace."}</p>
          </div>
          <button class="btn icon" data-action="close-auth" title="Close">×</button>
        </div>
        <form class="project-form" data-action="${creating ? "create-account" : "sign-in"}">
          <div class="form-grid">
            ${creating ? `
              <label class="field-label">
                <span>First name</span>
                <input required name="firstName" autocomplete="given-name" placeholder="First name" />
              </label>
              <label class="field-label">
                <span>Last name</span>
                <input required name="lastName" autocomplete="family-name" placeholder="Last name" />
              </label>
              <label class="field-label">
                <span>Institution</span>
                <input required name="institution" autocomplete="organization" placeholder="University, unit, or organization" />
              </label>
              <label class="field-label">
                <span>Title</span>
                <input required name="title" autocomplete="organization-title" placeholder="Researcher, librarian, student..." />
              </label>
            ` : ""}
            <label class="field-label wide">
              <span>Email</span>
              <input required type="email" name="email" autocomplete="email" placeholder="you@example.org" />
            </label>
            <label class="field-label wide">
              <span>Password</span>
              <input required type="password" name="password" autocomplete="${creating ? "new-password" : "current-password"}" minlength="${creating ? "12" : "8"}" />
            </label>
            ${creating ? `
              <label class="field-label wide">
                <span>Confirm password</span>
                <input required type="password" name="confirmPassword" autocomplete="new-password" minlength="12" />
              </label>
              <div class="password-rules wide">
                <strong>Password requirements</strong>
                <span>Use at least 12 characters with uppercase, lowercase, number, and symbol. Avoid your name, institution, email, and common passwords.</span>
              </div>
            ` : ""}
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" data-action="${creating ? "show-sign-in" : "show-create-account"}">${creating ? "Sign in instead" : "Create account instead"}</button>
            <button class="btn primary" type="submit">${creating ? "Create account" : "Sign in"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function profileModal() {
  const user = currentUser();
  if (!user) return "";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div class="modal-head">
          <div>
            <h2 id="profile-title">Profile</h2>
            <p>Edit your account details for protocol authorship and workspace records.</p>
          </div>
          <button class="btn icon" data-action="close-profile" title="Close">×</button>
        </div>
        <form class="project-form" data-action="update-profile">
          <div class="form-grid">
            <label class="field-label">
              <span>First name</span>
              <input required name="firstName" autocomplete="given-name" value="${escapeAttr(user.firstName || "")}" />
            </label>
            <label class="field-label">
              <span>Last name</span>
              <input required name="lastName" autocomplete="family-name" value="${escapeAttr(user.lastName || "")}" />
            </label>
            <label class="field-label">
              <span>Institution</span>
              <input required name="institution" autocomplete="organization" value="${escapeAttr(user.institution || "")}" />
            </label>
            <label class="field-label">
              <span>Title</span>
              <input required name="title" autocomplete="organization-title" value="${escapeAttr(user.title || "")}" />
            </label>
            <label class="field-label wide">
              <span>Email</span>
              <input required type="email" name="email" autocomplete="email" value="${escapeAttr(user.email || "")}" />
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" data-action="close-profile">Cancel</button>
            <button class="btn primary" type="submit">Save profile</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function sourceList(sources, limit) {
  const visible = sources.slice(0, limit);
  if (!visible.length) return `<div class="hint">No source metadata has been added for this checklist yet.</div>`;
  return `
    <div class="source-list">
      ${visible.map((source) => `
        <a class="source-card" href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">
          <span class="source-type">${escapeHtml(source.type)}</span>
          <strong>${escapeHtml(source.title)}</strong>
          <small>${escapeHtml(source.organization)}</small>
          <p>${escapeHtml(source.note)}</p>
        </a>
      `).join("")}
    </div>
  `;
}

function projectModal() {
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <div class="modal-head">
          <h2 id="new-project-title">Create protocol project</h2>
          <button class="btn icon" data-action="close-modal" title="Close">×</button>
        </div>
        <form class="project-form" data-action="create-project">
          <div class="form-grid">
            <label class="field-label wide">
              <span>Protocol title</span>
              <input required name="title" placeholder="Protocol for a systematic review of..." />
            </label>
            <label class="field-label">
              <span>Short title</span>
              <input name="shortTitle" placeholder="Hypertension CHW review" />
            </label>
            <label class="field-label">
              <span>Review type</span>
              <select required name="reviewType">
                ${CHECKLIST_MANIFEST.map((item) => `<option value="${item.type}">${escapeHtml(item.label)}</option>`).join("")}
              </select>
            </label>
            <label class="field-label">
              <span>Lead author or team</span>
              <input name="lead" placeholder="Evidence Synthesis Unit" />
            </label>
            <label class="field-label">
              <span>Purpose</span>
              <input name="purpose" placeholder="Policy decision, dissertation, guideline input..." />
            </label>
            <label class="field-label wide">
              <span>Notes</span>
              <textarea name="notes" placeholder="Key stakeholders, deadlines, registration plans, or context."></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" data-action="close-modal">Cancel</button>
            <button class="btn primary" type="submit">Create project</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-action]").forEach((element) => {
    const action = element.dataset.action;
    if (action === "response") {
      element.addEventListener("input", updateResponse);
      element.addEventListener("blur", render);
      return;
    }
    if (action === "status") {
      element.addEventListener("change", updateStatus);
      return;
    }
    if (action === "create-project") {
      element.addEventListener("submit", createProject);
      return;
    }
    if (action === "create-account") {
      element.addEventListener("submit", createAccount);
      return;
    }
    if (action === "sign-in") {
      element.addEventListener("submit", signIn);
      return;
    }
    if (action === "update-profile") {
      element.addEventListener("submit", updateProfile);
      return;
    }
    element.addEventListener("click", handleAction);
  });
}

function handleAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  const id = button.dataset.id || state.activeProjectId;
  if (action === "dashboard") {
    state.view = "dashboard";
    state.activeProjectId = null;
    state.activeSection = null;
  }
  if (action === "new-project") {
    if (currentUser()) state.modalOpen = true;
    else state.authMode = "create";
  }
  if (action === "close-modal") state.modalOpen = false;
  if (action === "show-create-account") state.authMode = "create";
  if (action === "show-sign-in") state.authMode = "sign-in";
  if (action === "close-auth") state.authMode = "";
  if (action === "profile") state.profileOpen = true;
  if (action === "close-profile") state.profileOpen = false;
  if (action === "sign-out") signOut();
  if (action === "guidance") state.guidanceOpen = true;
  if (action === "close-guidance") state.guidanceOpen = false;
  if (action === "open-project") openProject(id);
  if (action === "builder") state.view = "builder";
  if (action === "preview") state.view = "preview";
  if (action === "section") state.activeSection = button.dataset.section;
  if (action === "duplicate-project") duplicateProject(id);
  if (action === "delete-project") deleteProject(id);
  if (action === "export-doc") exportProtocol(id);
  if (action === "export-report") exportReport(id);
  if (action === "use-example") useExample(button.dataset.itemId);
  render();
}

async function createProject(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user) {
    state.authMode = "create";
    render();
    return;
  }
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const checklist = getChecklist(data.reviewType);
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    title: data.title.trim(),
    shortTitle: data.shortTitle.trim(),
    reviewType: data.reviewType,
    lead: data.lead.trim(),
    purpose: data.purpose.trim(),
    notes: data.notes.trim(),
    createdAt: now,
    updatedAt: now,
    exportedAt: "",
    ownerId: user.id,
    responses: Object.fromEntries(
      checklist.items.map((item) => [item.id, { value: "", status: "incomplete" }])
    )
  };
  state.projects.unshift(project);
  await persistProject(project, "POST");
  state.modalOpen = false;
  openProject(project.id);
  showToast("Project created");
}

function openProject(id) {
  const project = findProject(id);
  if (!project) return;
  const checklist = getChecklist(project.reviewType);
  state.activeProjectId = id;
  state.activeSection = state.activeSection || checklist.sections[0];
  state.view = "builder";
}

async function duplicateProject(id) {
  const project = findProject(id);
  if (!project) return;
  const now = new Date().toISOString();
  const clone = {
    ...structuredClone(project),
    id: crypto.randomUUID(),
    title: `${project.title} copy`,
    createdAt: now,
    updatedAt: now,
    exportedAt: ""
  };
  state.projects.unshift(clone);
  await persistProject(clone, "POST");
  showToast("Project duplicated");
}

async function deleteProject(id) {
  const project = findProject(id);
  if (!project) return;
  if (!confirm(`Delete "${project.title}"?`)) return;
  state.projects = state.projects.filter((item) => item.id !== id);
  if (state.activeProjectId === id) {
    state.activeProjectId = null;
    state.activeSection = null;
    state.view = "dashboard";
  }
  await deleteProjectRemote(id);
  showToast("Project deleted");
}

async function createAccount(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const email = normalizeEmail(data.email);
  const profile = {
    firstName: String(data.firstName || "").trim(),
    lastName: String(data.lastName || "").trim(),
    institution: String(data.institution || "").trim(),
    title: String(data.title || "").trim(),
    email
  };
  const passwordError = validatePassword(data.password, data.confirmPassword, profile);
  if (passwordError) {
    showToast(passwordError);
    return;
  }
  if (state.backendAvailable) {
    try {
      const payload = await apiRequest("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ ...profile, password: data.password, confirmPassword: data.confirmPassword })
      });
      state.backendToken = payload.token;
      state.backendUser = payload.user;
      localStorage.setItem(BACKEND_SESSION_KEY, payload.token);
      state.projects = await apiRequest("/api/projects");
      state.authMode = "";
      state.view = "dashboard";
      showToast("Account created");
      render();
      return;
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  if (state.accounts.some((account) => account.email === email)) {
    showToast("Account already exists");
    return;
  }
  const salt = crypto.randomUUID();
  const account = {
    id: crypto.randomUUID(),
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    firstName: profile.firstName,
    lastName: profile.lastName,
    institution: profile.institution,
    title: profile.title,
    email,
    salt,
    passwordHash: await hashPassword(data.password, salt),
    createdAt: new Date().toISOString()
  };
  state.accounts.push(account);
  assignOrphanedProjects(account.id);
  saveAccounts();
  saveProjects();
  saveSession(account.id);
  state.authMode = "";
  state.view = "dashboard";
  showToast("Account created");
  render();
}

async function signIn(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const email = normalizeEmail(data.email);
  if (state.backendAvailable) {
    try {
      const payload = await apiRequest("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ email, password: data.password })
      });
      state.backendToken = payload.token;
      state.backendUser = payload.user;
      localStorage.setItem(BACKEND_SESSION_KEY, payload.token);
      state.projects = await apiRequest("/api/projects");
      state.authMode = "";
      state.view = "dashboard";
      state.activeProjectId = null;
      state.activeSection = null;
      showToast("Signed in");
      render();
      return;
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  const account = state.accounts.find((item) => item.email === email);
  if (!account) {
    showToast("Account not found");
    return;
  }
  const passwordHash = await hashPassword(data.password, account.salt);
  if (passwordHash !== account.passwordHash) {
    showToast("Incorrect password");
    return;
  }
  saveSession(account.id);
  state.authMode = "";
  state.view = "dashboard";
  state.activeProjectId = null;
  state.activeSection = null;
  showToast("Signed in");
  render();
}

async function updateProfile(event) {
  event.preventDefault();
  const user = currentUser();
  if (!user) return;
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const profile = {
    firstName: String(data.firstName || "").trim(),
    lastName: String(data.lastName || "").trim(),
    institution: String(data.institution || "").trim(),
    title: String(data.title || "").trim(),
    email: normalizeEmail(data.email)
  };
  if (Object.values(profile).some((value) => !value)) {
    showToast("All profile fields are required");
    return;
  }
  if (state.backendAvailable) {
    try {
      const payload = await apiRequest("/api/me", {
        method: "PUT",
        body: JSON.stringify(profile)
      });
      state.backendUser = payload.user;
      state.profileOpen = false;
      showToast("Profile updated");
      render();
      return;
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  if (state.accounts.some((account) => account.email === profile.email && account.id !== user.id)) {
    showToast("Email is already in use");
    return;
  }
  Object.assign(user, profile, {
    name: `${profile.firstName} ${profile.lastName}`.trim()
  });
  saveAccounts();
  state.profileOpen = false;
  showToast("Profile updated");
  render();
}

function signOut() {
  if (state.backendAvailable) {
    if (state.backendToken) {
      apiRequest("/api/sessions/logout", { method: "POST" }).catch(() => {});
    }
    state.backendToken = "";
    state.backendUser = null;
    state.projects = [];
    localStorage.removeItem(BACKEND_SESSION_KEY);
  }
  saveSession("");
  state.activeProjectId = null;
  state.activeSection = null;
  state.view = "dashboard";
  showToast("Signed out");
}

function assignOrphanedProjects(userId) {
  state.projects.forEach((project) => {
    if (!project.ownerId) project.ownerId = userId;
  });
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validatePassword(password, confirmPassword, profile = {}) {
  const value = String(password || "");
  if (value !== String(confirmPassword || "")) return "Passwords do not match";
  if (value.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(value)) return "Password needs an uppercase letter";
  if (!/[a-z]/.test(value)) return "Password needs a lowercase letter";
  if (!/[0-9]/.test(value)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password needs a symbol";
  const lower = value.toLowerCase();
  const forbidden = [
    "password",
    "reviewprotocol",
    "protocolstudio",
    profile.email?.split("@")[0],
    profile.firstName,
    profile.lastName,
    profile.institution
  ].filter((part) => String(part || "").trim().length >= 4);
  if (forbidden.some((part) => lower.includes(String(part).toLowerCase()))) {
    return "Password should not include your name, institution, email, or common words";
  }
  return "";
}

function updateResponse(event) {
  const project = getActiveProject();
  if (!project) return;
  const itemId = event.currentTarget.dataset.itemId;
  const current = project.responses[itemId] || { value: "", status: "incomplete" };
  current.value = event.currentTarget.value;
  if (current.value.trim().length > 0 && current.status === "incomplete") current.status = "complete";
  if (current.value.trim().length === 0 && current.status === "complete") current.status = "incomplete";
  project.responses[itemId] = current;
  touchProject(project);
  persistProject(project);
}

function updateStatus(event) {
  const project = getActiveProject();
  if (!project) return;
  const itemId = event.currentTarget.dataset.itemId;
  const current = project.responses[itemId] || { value: "", status: "incomplete" };
  current.status = event.currentTarget.value;
  project.responses[itemId] = current;
  touchProject(project);
  persistProject(project);
  render();
}

function useExample(itemId) {
  const project = getActiveProject();
  if (!project) return;
  const item = getChecklist(project.reviewType).items.find((entry) => entry.id === itemId);
  if (!item) return;
  project.responses[itemId] = { value: item.exampleResponse, status: "complete" };
  touchProject(project);
  persistProject(project);
  showToast("Example inserted");
}

function exportProtocol(id) {
  const project = id ? findProject(id) : getActiveProject();
  if (!project) return;
  const issues = consistencyIssues(project);
  const summary = projectSummary(project);
  const warning = summary.completion < 100 || issues.length
    ? `<p><strong>Pre-export status:</strong> ${summary.completion}% complete with ${issues.length} consistency issue${issues.length === 1 ? "" : "s"} detected.</p>`
    : "";
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(project.title)}</title>
        <style>
          body { font-family: Cambria, Georgia, serif; line-height: 1.45; color: #111; }
          h1 { font-size: 24pt; }
          h2 { font-size: 16pt; margin-top: 22pt; border-bottom: 1px solid #bbb; padding-bottom: 4pt; }
          h3 { font-size: 12pt; margin-top: 12pt; margin-bottom: 4pt; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #999; padding: 6pt; text-align: left; vertical-align: top; }
          .missing { color: #8a4b00; font-style: italic; }
          .draft-gaps { border: 1px solid #d9b36c; background: #fff8e7; padding: 8pt; margin-top: 10pt; }
        </style>
      </head>
      <body>${warning}${protocolHtml(project, true)}${complianceAppendix(project)}</body>
    </html>
  `;
  download(`${slug(project.shortTitle || project.title)}-protocol.doc`, html, "application/msword");
  project.exportedAt = new Date().toISOString();
  touchProject(project);
  persistProject(project);
  showToast("Word document exported");
}

function exportReport(id) {
  const project = id ? findProject(id) : getActiveProject();
  if (!project) return;
  const checklist = getChecklist(project.reviewType);
  const rows = [
    ["Element number", "Section", "Element", "Required", "Status", "Requirement", "Response"],
    ...checklist.items.map((item) => {
      const response = project.responses[item.id] || { value: "", status: "incomplete" };
      return [
        item.itemNumber,
        item.section,
        item.elementLabel || item.itemKind || "Checklist-linked prompt",
        item.required ? "Yes" : "No",
        statusLabel(getItemStatus(project, item)),
        item.requirement,
        response.value || ""
      ];
    })
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  download(`${slug(project.shortTitle || project.title)}-checklist-report.csv`, csv, "text/csv");
  showToast("Checklist report exported");
}

function protocolHtml(project, forExport) {
  const checklist = getChecklist(project.reviewType);
  const byOutput = new Map();
  checklist.items.forEach((item) => {
    const key = item.outputSection || item.section;
    if (!byOutput.has(key)) byOutput.set(key, []);
    byOutput.get(key).push(item);
  });
  const sections = checklist.sections
    .map((section) => {
      const items = byOutput.get(section) || [];
      const body = items.length
        ? draftSectionHtml(project, section, items)
        : `<p class="missing">No protocol elements have been added to this section yet.</p>`;
      return `<h2>${escapeHtml(section)}</h2>${body}`;
    })
    .join("");
  return `
    <h1>${escapeHtml(project.title)}</h1>
    <p class="subtitle">${escapeHtml(checklist.label)} · ${escapeHtml(checklist.framework)}</p>
    <p><strong>Lead author or team:</strong> ${escapeHtml(project.lead || "Not specified")}</p>
    <p><strong>Purpose:</strong> ${escapeHtml(project.purpose || "Not specified")}</p>
    ${project.notes ? `<p><strong>Project notes:</strong> ${escapeHtml(project.notes)}</p>` : ""}
    ${sections}
    <h2>Guidance Sources</h2>
    ${guidanceSourcesHtml(checklist)}
    ${forExport ? "" : `<h2>Checklist Compliance Appendix</h2>${complianceTable(project)}`}
  `;
}

function draftSectionHtml(project, section, items) {
  const details = sectionDetails(project, items);
  const renderers = {
    "Title page": draftTitlePage,
    "Background and rationale": draftBackground,
    "Review question": draftReviewQuestion,
    "Objectives": draftObjectives,
    "Eligibility criteria": draftEligibility,
    "Information sources": draftInformationSources,
    "Search strategy": draftSearchStrategy,
    "Study selection": draftStudySelection,
    "Data extraction/charting": draftDataExtraction,
    "Critical appraisal/risk of bias": draftCriticalAppraisal,
    "Synthesis plan": draftSynthesisPlan,
    "Certainty/confidence assessment": draftConfidenceAssessment,
    "Equity and contextual considerations": draftEquity,
    "Stakeholder involvement": draftStakeholders,
    "Timeline": draftTimeline,
    "Roles and responsibilities": draftRoles,
    "Dissemination plan": draftDissemination,
    "References": draftReferences,
    "Appendices": draftAppendices
  };
  const body = (renderers[section] || draftGenericSection)(details, project);
  return body + draftingGaps(details);
}

function sectionDetails(project, items) {
  const entries = items.map((item) => {
    const response = project.responses[item.id] || { value: "", status: "incomplete" };
    return {
      item,
      label: item.elementLabel || item.requirement.replace(/^Protocol element:\s*/i, "").replace(/\.$/, ""),
      value: cleanText(response.value),
      status: getItemStatus(project, item)
    };
  });
  return {
    entries,
    values: entries.reduce((acc, entry) => {
      if (entry.value && entry.status !== "na") acc[entry.label] = entry.value;
      return acc;
    }, {}),
    additional: entries.filter((entry) => !entry.item.itemKind && entry.value && entry.status !== "na"),
    missing: entries.filter((entry) => entry.item.required && !entry.value && entry.status !== "na")
  };
}

function draftTitlePage(details, project) {
  return [
    keyValue("Protocol title", details.values["Protocol title"] || project.title),
    keyValue("Review type", getChecklist(project.reviewType).label),
    keyValue("Version and date", details.values["Protocol version and date"]),
    keyValue("Authors and affiliations", details.values["Authors and affiliations"] || project.lead),
    keyValue("Funding and competing interests", details.values["Funding and competing interests"]),
    keyValue("Purpose", project.purpose),
    details.additional.length ? draftAdditional(details) : ""
  ].join("");
}

function draftBackground(details) {
  return [
    paragraph([
      details.values["Topic and problem"],
      details.values["What is already known"],
      details.values["Evidence gap or uncertainty"]
    ]),
    paragraph([
      details.values["Why this review type"],
      details.values["Decision and user context"]
    ]),
    draftAdditional(details)
  ].join("");
}

function draftReviewQuestion(details) {
  return [
    paragraph([details.values["Question statement"]]),
    subSection("Framework elements", details.values["Framework elements"]),
    subSection("Scope boundaries", details.values["Scope boundaries"]),
    firstExisting(details.values, ["Map rows and columns", "Initial programme theory", "Integrated question"], (label, value) => subSection(label, value)),
    draftAdditional(details)
  ].join("");
}

function draftObjectives(details) {
  return [
    subSection("Primary objective", details.values["Primary objective"]),
    subSection("Secondary objectives", details.values["Secondary objectives"]),
    subSection("Planned use of findings", details.values["Planned use of findings"]),
    draftAdditional(details)
  ].join("");
}

function draftEligibility(details) {
  return [
    subSection("Population or participants", details.values["Population or participants"]),
    subSection("Concept, intervention, or exposure", details.values["Concept, intervention, or exposure"]),
    subSection("Comparator, context, or setting", details.values["Comparator, context, or setting"]),
    subSection("Outcomes, phenomena, or map domains", details.values["Outcomes, phenomena, or map domains"]),
    subSection("Evidence types and study designs", details.values["Evidence types and study designs"]),
    subSection("Limits and exclusions", details.values["Limits and exclusions"]),
    subSection("Rapid review restrictions", details.values["Rapid review restrictions"]),
    draftAdditional(details)
  ].join("");
}

function draftInformationSources(details) {
  return [
    paragraph([
      sentence("Bibliographic database searches will include", details.values["Bibliographic databases"]),
      sentence("Specialist sources and registers will include", details.values["Specialist sources and registers"]),
      sentence("Grey literature and website searches will include", details.values["Grey literature and websites"]),
      sentence("Supplementary search methods will include", details.values["Supplementary search methods"])
    ]),
    draftAdditional(details)
  ].join("");
}

function draftSearchStrategy(details) {
  return [
    subSection("Search concepts", details.values["Search concepts"]),
    subSection("Controlled vocabulary and keywords", details.values["Controlled vocabulary and keywords"]),
    subSection("Limits and restrictions", details.values["Limits and restrictions"]),
    subSection("Search peer review and documentation", details.values["Search peer review and documentation"]),
    subSection("Search updating", details.values["Search updating"]),
    subSection("Surveillance schedule", details.values["Surveillance schedule"]),
    draftAdditional(details)
  ].join("");
}

function draftStudySelection(details) {
  return [
    subSection("Screening stages", details.values["Screening stages"]),
    subSection("Reviewer process", details.values["Reviewer process"]),
    subSection("Piloting and calibration", details.values["Piloting and calibration"]),
    subSection("Disagreement resolution", details.values["Disagreement resolution"]),
    subSection("Exclusion documentation", details.values["Exclusion documentation"]),
    subSection("Abbreviated screening safeguards", details.values["Abbreviated screening safeguards"]),
    draftAdditional(details)
  ].join("");
}

function draftDataExtraction(details) {
  return [
    subSection("Extraction variables", details.values["Extraction variables"]),
    subSection("Extraction form and piloting", details.values["Extraction form and piloting"]),
    subSection("Reviewer process and verification", details.values["Reviewer process and verification"]),
    subSection("Handling missing or unclear data", details.values["Handling missing or unclear data"]),
    subSection("Data management", details.values["Data management"]),
    subSection("Map codebook", details.values["Map codebook"]),
    draftAdditional(details)
  ].join("");
}

function draftCriticalAppraisal(details) {
  return [
    subSection("Need for appraisal", details.values["Need for appraisal"]),
    subSection("Appraisal tools", details.values["Appraisal tools"]),
    subSection("Appraisal process", details.values["Appraisal process"]),
    subSection("Use of appraisal in synthesis", details.values["Use of appraisal in synthesis"]),
    draftAdditional(details)
  ].join("");
}

function draftSynthesisPlan(details) {
  return [
    subSection("Synthesis approach", details.values["Synthesis approach"]),
    subSection("Grouping and comparison", details.values["Grouping and comparison"]),
    subSection("Quantitative synthesis or summary", details.values["Quantitative synthesis or summary"]),
    subSection("Qualitative, conceptual, or explanatory synthesis", details.values["Qualitative, conceptual, or explanatory synthesis"]),
    subSection("Handling heterogeneity or variation", details.values["Handling heterogeneity or variation"]),
    subSection("Presentation of findings", details.values["Presentation of findings"]),
    subSection("Gap interpretation rules", details.values["Gap interpretation rules"]),
    subSection("CMO refinement", details.values["CMO refinement"]),
    subSection("Integration method", details.values["Integration method"]),
    subSection("Update triggers", details.values["Update triggers"]),
    draftAdditional(details)
  ].join("");
}

function draftConfidenceAssessment(details) {
  return [
    subSection("Assessment framework", details.values["Assessment framework"]),
    subSection("Findings assessed", details.values["Findings assessed"]),
    subSection("Reporting confidence", details.values["Reporting confidence"]),
    draftAdditional(details)
  ].join("");
}

function draftEquity(details) {
  return [
    subSection("Equity factors", details.values["Equity factors"]),
    subSection("Context and setting", details.values["Context and setting"]),
    subSection("Subgroup or applicability plans", details.values["Subgroup or applicability plans"]),
    subSection("Equity-sensitive reporting", details.values["Equity-sensitive reporting"]),
    draftAdditional(details)
  ].join("");
}

function draftStakeholders(details) {
  return [
    subSection("Stakeholder groups", details.values["Stakeholder groups"]),
    subSection("Engagement stages", details.values["Engagement stages"]),
    subSection("Use of stakeholder input", details.values["Use of stakeholder input"]),
    draftAdditional(details)
  ].join("");
}

function draftTimeline(details) {
  return [
    subSection("Milestones", details.values["Milestones"]),
    subSection("Dependencies and decision points", details.values["Dependencies and decision points"]),
    subSection("Update or amendment plan", details.values["Update or amendment plan"]),
    draftAdditional(details)
  ].join("");
}

function draftRoles(details) {
  return [
    subSection("Review team roles", details.values["Review team roles"]),
    subSection("Decision governance", details.values["Decision governance"]),
    subSection("Authorship and contributions", details.values["Authorship and contributions"]),
    subSection("Quality assurance", details.values["Quality assurance"]),
    draftAdditional(details)
  ].join("");
}

function draftDissemination(details) {
  return [
    subSection("Primary outputs", details.values["Primary outputs"]),
    subSection("Target audiences", details.values["Target audiences"]),
    subSection("Dissemination channels", details.values["Dissemination channels"]),
    subSection("Open materials and data", details.values["Open materials and data"]),
    draftAdditional(details)
  ].join("");
}

function draftReferences(details) {
  return [
    subSection("Citation management", details.values["Citation management"]),
    subSection("Protocol source references", details.values["Protocol source references"]),
    draftAdditional(details)
  ].join("");
}

function draftAppendices(details) {
  return [
    subSection("Search appendices", details.values["Search appendices"]),
    subSection("Screening and extraction tools", details.values["Screening and extraction tools"]),
    subSection("Appraisal and confidence tools", details.values["Appraisal and confidence tools"]),
    subSection("Protocol amendments", details.values["Protocol amendments"]),
    draftAdditional(details)
  ].join("");
}

function draftGenericSection(details) {
  const entries = details.entries.filter((entry) => entry.value && entry.status !== "na");
  if (!entries.length) return `<p class="missing">This section has not been drafted because no element responses have been provided.</p>`;
  return entries.map((entry) => subSection(entry.label, entry.value)).join("");
}

function draftAdditional(details) {
  if (!details.additional.length) return "";
  return details.additional.map((entry) => subSection(entry.label, entry.value)).join("");
}

function draftingGaps(details) {
  if (!details.missing.length) return "";
  return `<div class="draft-gaps"><strong>Drafting gaps to resolve:</strong><ul>${details.missing.map((entry) => `<li>${escapeHtml(entry.label)}</li>`).join("")}</ul></div>`;
}

function keyValue(label, value) {
  return value ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>` : "";
}

function paragraph(parts) {
  const text = parts.filter(Boolean).join(" ");
  return text ? `<p>${escapeHtml(text)}</p>` : "";
}

function subSection(title, value) {
  return value ? `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(value)}</p>` : "";
}

function sentence(prefix, value) {
  if (!value) return "";
  return `${prefix}: ${value}`;
}

function firstExisting(values, labels, renderer) {
  return labels.map((label) => values[label] ? renderer(label, values[label]) : "").join("");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function guidanceSourcesHtml(checklist) {
  const sources = checklist.sources || [];
  if (!sources.length) return `<p class="missing">No guidance sources have been recorded for this checklist.</p>`;
  return sources.map((source) => `<p><strong>${escapeHtml(source.title)}.</strong> ${escapeHtml(source.organization)}. ${escapeHtml(source.note)}<br /><a href="${escapeAttr(source.url)}">${escapeHtml(source.url)}</a></p>`).join("");
}

function responseParagraph(project, item) {
  const response = project.responses[item.id] || { value: "", status: "incomplete" };
  if (response.status === "na") {
    return `<p><strong>${escapeHtml(item.itemNumber)}.</strong> <em>Not applicable:</em> ${escapeHtml(response.value || "No rationale provided.")}</p>`;
  }
  if (!response.value.trim()) {
    return `<p class="missing"><strong>${escapeHtml(item.itemNumber)}.</strong> Missing response for: ${escapeHtml(item.prompt)}</p>`;
  }
  return `<p><strong>${escapeHtml(item.itemNumber)}.</strong> ${escapeHtml(response.value)}</p>`;
}

function complianceAppendix(project) {
  return `<h2>Checklist Compliance Appendix</h2>${complianceTable(project)}`;
}

function complianceTable(project) {
  const checklist = getChecklist(project.reviewType);
  return `
    <table>
      <thead><tr><th>Element</th><th>Section</th><th>Element name</th><th>Requirement</th><th>Status</th></tr></thead>
      <tbody>
        ${checklist.items.map((item) => `
          <tr>
            <td>${escapeHtml(item.itemNumber)}</td>
            <td>${escapeHtml(item.section)}</td>
            <td>${escapeHtml(item.elementLabel || item.itemKind || "Checklist-linked prompt")}</td>
            <td>${escapeHtml(item.requirement)}</td>
            <td>${escapeHtml(statusLabel(getItemStatus(project, item)))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function projectSummary(project) {
  const checklist = getChecklist(project.reviewType);
  const required = checklist.items.filter((item) => item.required);
  const completedItems = required.filter((item) => {
    const status = getItemStatus(project, item);
    return status === "complete" || status === "na";
  }).length;
  const completion = required.length ? Math.round((completedItems / required.length) * 100) : 100;
  const issueCount = consistencyIssues(project).length;
  const statusLabelText = issueCount ? "Inconsistent" : completion === 100 ? "Complete" : "Needs work";
  return {
    requiredItems: required.length,
    completedItems,
    completion,
    issueCount,
    statusLabel: statusLabelText,
    statusClass: issueCount ? "inconsistent" : completion === 100 ? "complete" : "needs"
  };
}

function consistencyIssues(project) {
  const text = allResponseText(project);
  const checklist = getChecklist(project.reviewType);
  const issues = [];
  const sources = responseForSection(project, "Information sources");
  const search = responseForSection(project, "Search strategy");
  const selection = responseForSection(project, "Study selection");
  const appraisal = responseForSection(project, "Critical appraisal/risk of bias");
  const synthesis = responseForSection(project, "Synthesis plan");
  const certainty = responseForSection(project, "Certainty/confidence assessment");
  const eligibility = responseForSection(project, "Eligibility criteria");

  if (search && !sources) issues.push("A search strategy is described, but information sources are missing.");
  if (sources && !search) issues.push("Information sources are listed, but no search strategy is documented.");
  if (/meta-analysis|random-effects|fixed-effects/i.test(synthesis) && !/effect|outcome|measure|estimate/i.test(eligibility)) {
    issues.push("Meta-analysis is planned, but eligible outcomes or effect measures are not clear.");
  }
  if (/GRADE|certainty/i.test(certainty || text) && !appraisal) {
    issues.push("Certainty assessment is mentioned, but the risk-of-bias or appraisal plan is missing.");
  }
  if (/single[- ]reviewer|one reviewer/i.test(selection) && project.reviewType !== "rapid") {
    issues.push("Single-reviewer screening is described in a non-rapid review; justify this or revise the screening method.");
  }
  if (/no language restriction/i.test(search) && /english|language restriction/i.test(eligibility)) {
    issues.push("The search says there is no language restriction, but eligibility mentions language limits.");
  }
  if (project.reviewType === "scoping" && /meta-analysis|pooled effect/i.test(synthesis)) {
    issues.push("A scoping review usually maps evidence; planned meta-analysis needs a clear justification.");
  }
  if (project.reviewType === "rapid" && !/shortcut|limited|single|abbreviated|rapid|timeline|restriction/i.test(text)) {
    issues.push("Rapid review shortcuts or timeline-driven adaptations have not been documented.");
  }
  if (project.reviewType === "egm" && !/row|column|matrix|map|framework|dimension/i.test(text)) {
    issues.push("The EGM map framework needs rows, columns, filters, or matrix dimensions.");
  }
  if (project.reviewType === "qualitative" && /meta-analysis|pooled effect/i.test(synthesis)) {
    issues.push("A qualitative evidence synthesis should specify a qualitative synthesis method rather than meta-analysis.");
  }
  if (project.reviewType === "mixed-methods" && !/integrat|joint display|convergent|segregated|transform/i.test(text)) {
    issues.push("The mixed-methods protocol should explain how quantitative and qualitative evidence will be integrated.");
  }
  if ((project.reviewType === "umbrella" || project.reviewType === "review-of-reviews") && !/overlap|AMSTAR|review quality|confidence|duplicate/i.test(text)) {
    issues.push("The review-of-reviews protocol should explain review quality appraisal and overlap handling.");
  }
  if (project.reviewType === "realist" && !/context|mechanism|outcome|CMO|programme theory|program theory/i.test(text)) {
    issues.push("The realist review protocol should include programme theory or context-mechanism-outcome logic.");
  }
  if (project.reviewType === "living" && !/monthly|quarterly|surveillance|alert|update|trigger|living/i.test(text)) {
    issues.push("The living review protocol should define evidence surveillance frequency and update triggers.");
  }
  if (checklist.items.some((item) => item.required && getItemStatus(project, item) === "needs")) {
    issues.push("One or more required protocol elements are marked as needing clarification.");
  }
  return [...new Set(issues)].slice(0, 8);
}

function countStatuses(project) {
  const checklist = getChecklist(project.reviewType);
  const counts = { complete: 0, incomplete: 0, needs: 0, na: 0 };
  checklist.items.forEach((item) => {
    counts[getItemStatus(project, item)] += 1;
  });
  return counts;
}

function getItemStatus(project, item) {
  const response = project.responses[item.id];
  if (!response) return "incomplete";
  if (response.status === "complete" && !String(response.value || "").trim() && item.required) return "incomplete";
  return response.status || "incomplete";
}

function responseForSection(project, section) {
  const checklist = getChecklist(project.reviewType);
  return checklist.items
    .filter((item) => item.section === section || item.outputSection === section)
    .map((item) => project.responses[item.id]?.value || "")
    .filter(Boolean)
    .join("\n");
}

function allResponseText(project) {
  return Object.values(project.responses).map((response) => response.value || "").join("\n");
}

function getChecklist(type) {
  return state.checklists[type] || state.checklists.systematic || { items: [], sections: [], label: type, framework: "" };
}

function getActiveProject() {
  return findProject(state.activeProjectId);
}

function findProject(id) {
  return visibleProjects().find((item) => item.id === id);
}

function touchProject(project) {
  project.updatedAt = new Date().toISOString();
}

function showToast(message) {
  state.toast = message;
  window.clearTimeout(showToast.timer);
  render();
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 1800);
}

function statusPill(label, cls) {
  return `<span class="status-pill ${cls || ""}">${escapeHtml(label)}</span>`;
}

function statusLabel(status) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] || "Incomplete";
}

function statusClass(status) {
  if (status === "complete") return "complete";
  if (status === "na") return "na";
  if (status === "needs") return "needs";
  return "";
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return String(value || "protocol")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "protocol";
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
