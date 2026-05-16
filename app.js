const CHECKLIST_MANIFEST = [
  {
    type: "systematic",
    label: "Systematic review protocol",
    file: "./data/checklists/prisma-p-systematic-review-protocol.json"
  },
  {
    type: "scoping",
    label: "Scoping review protocol",
    file: "./data/checklists/jbi-scoping-review-protocol.json"
  },
  {
    type: "rapid",
    label: "Rapid review protocol",
    file: "./data/checklists/rapid-review-protocol.json"
  },
  {
    type: "egm",
    label: "Evidence and gap map protocol",
    file: "./data/checklists/evidence-gap-map-protocol.json"
  },
  {
    type: "qualitative",
    label: "Qualitative evidence synthesis protocol",
    file: "./data/checklists/qualitative-evidence-synthesis-protocol.json"
  },
  {
    type: "mixed-methods",
    label: "Mixed-methods review protocol",
    file: "./data/checklists/mixed-methods-review-protocol.json"
  },
  {
    type: "umbrella",
    label: "Umbrella review protocol",
    file: "./data/checklists/umbrella-review-protocol.json"
  },
  {
    type: "review-of-reviews",
    label: "Review of reviews protocol",
    file: "./data/checklists/review-of-reviews-protocol.json"
  },
  {
    type: "realist",
    label: "Realist review protocol",
    file: "./data/checklists/realist-review-protocol.json"
  },
  {
    type: "living",
    label: "Living systematic review protocol",
    file: "./data/checklists/living-systematic-review-protocol.json"
  }
];

const STORAGE_KEY = "review-protocol-studio-projects-v1";
const STATUS_OPTIONS = [
  ["incomplete", "Incomplete"],
  ["complete", "Complete"],
  ["needs", "Needs clarification"],
  ["na", "Not applicable"]
];

const app = document.querySelector("#app");
const state = {
  checklists: {},
  projects: [],
  view: "dashboard",
  activeProjectId: null,
  activeSection: null,
  modalOpen: false,
  guidanceOpen: false,
  toast: ""
};

init();

async function init() {
  state.projects = loadProjects();
  await loadChecklists();
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
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
      ${state.guidanceOpen ? guidanceModal(project) : ""}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
  bindEvents();
}

function topbar(project) {
  const inProject = Boolean(project);
  return `
    <header class="topbar">
      <button class="brand" data-action="dashboard" title="Dashboard">
        <img class="brand-logo" src="./public/review-protocol-studio-logo.svg?v=20260516-guidance-1" alt="Review Protocol Studio" />
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
        <button class="btn primary" data-action="new-project">New protocol</button>
      </nav>
    </header>
  `;
}

function dashboardView() {
  const metrics = dashboardMetrics();
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
        ${state.projects.length ? projectTable() : emptyState()}
      </section>
    </section>
  `;
}

function dashboardMetrics() {
  const summaries = state.projects.map(projectSummary);
  const total = summaries.length;
  const average = total ? Math.round(summaries.reduce((sum, item) => sum + item.completion, 0) / total) : 0;
  return {
    total,
    average,
    ready: summaries.filter((item) => item.completion === 100 && item.issueCount === 0).length,
    needsReview: summaries.filter((item) => item.issueCount > 0 || item.completion < 100).length
  };
}

function projectTable() {
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
        ${state.projects.map(projectRow).join("")}
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
            <p>${sectionItems.length} checklist item${sectionItems.length === 1 ? "" : "s"} in this section</p>
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
          ${item.required ? statusPill("Required", "needs") : statusPill("Optional", "na")}
          ${statusPill(statusLabel(getItemStatus(project, item)), statusClass(getItemStatus(project, item)))}
        </div>
        <h2>${escapeHtml(item.prompt)}</h2>
        <p class="requirement">${escapeHtml(item.requirement)}</p>
      </div>
      <div class="prompt-body">
        <div class="hint"><strong>Help:</strong> ${escapeHtml(item.helpText)}<br /><strong>Example:</strong> ${escapeHtml(item.exampleResponse)}</div>
        <label class="field-label">
          <span>Your protocol content</span>
          <textarea data-action="response" data-item-id="${item.id}" placeholder="${escapeAttr(item.exampleResponse)}">${escapeHtml(response.value || "")}</textarea>
        </label>
        <div class="prompt-actions">
          <label class="field-label">
            <span>Checklist status</span>
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
  return `<div class="empty-state"><h2>No prompts in this section</h2><p>This section will appear in the generated protocol and can be expanded by adding checklist items to the JSON file.</p></div>`;
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
        <p>${summary.completedItems}/${summary.requiredItems} required items complete</p>
      </div>
      <div class="inspector-section">
        <p class="mini-title">Item states</p>
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
  if (action === "new-project") state.modalOpen = true;
  if (action === "close-modal") state.modalOpen = false;
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

function createProject(event) {
  event.preventDefault();
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
    responses: Object.fromEntries(
      checklist.items.map((item) => [item.id, { value: "", status: "incomplete" }])
    )
  };
  state.projects.unshift(project);
  saveProjects();
  state.modalOpen = false;
  openProject(project.id);
  showToast("Project created");
}

function openProject(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  const checklist = getChecklist(project.reviewType);
  state.activeProjectId = id;
  state.activeSection = state.activeSection || checklist.sections[0];
  state.view = "builder";
}

function duplicateProject(id) {
  const project = state.projects.find((item) => item.id === id);
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
  saveProjects();
  showToast("Project duplicated");
}

function deleteProject(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  if (!confirm(`Delete "${project.title}"?`)) return;
  state.projects = state.projects.filter((item) => item.id !== id);
  if (state.activeProjectId === id) {
    state.activeProjectId = null;
    state.activeSection = null;
    state.view = "dashboard";
  }
  saveProjects();
  showToast("Project deleted");
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
  saveProjects();
}

function updateStatus(event) {
  const project = getActiveProject();
  if (!project) return;
  const itemId = event.currentTarget.dataset.itemId;
  const current = project.responses[itemId] || { value: "", status: "incomplete" };
  current.status = event.currentTarget.value;
  project.responses[itemId] = current;
  touchProject(project);
  saveProjects();
  render();
}

function useExample(itemId) {
  const project = getActiveProject();
  if (!project) return;
  const item = getChecklist(project.reviewType).items.find((entry) => entry.id === itemId);
  if (!item) return;
  project.responses[itemId] = { value: item.exampleResponse, status: "complete" };
  touchProject(project);
  saveProjects();
  showToast("Example inserted");
}

function exportProtocol(id) {
  const project = id ? state.projects.find((item) => item.id === id) : getActiveProject();
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
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #999; padding: 6pt; text-align: left; vertical-align: top; }
          .missing { color: #8a4b00; font-style: italic; }
        </style>
      </head>
      <body>${warning}${protocolHtml(project, true)}${complianceAppendix(project)}</body>
    </html>
  `;
  download(`${slug(project.shortTitle || project.title)}-protocol.doc`, html, "application/msword");
  project.exportedAt = new Date().toISOString();
  touchProject(project);
  saveProjects();
  showToast("Word document exported");
}

function exportReport(id) {
  const project = id ? state.projects.find((item) => item.id === id) : getActiveProject();
  if (!project) return;
  const checklist = getChecklist(project.reviewType);
  const rows = [
    ["Item number", "Section", "Required", "Status", "Requirement", "Response"],
    ...checklist.items.map((item) => {
      const response = project.responses[item.id] || { value: "", status: "incomplete" };
      return [
        item.itemNumber,
        item.section,
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
        ? items.map((item) => responseParagraph(project, item)).join("")
        : `<p class="missing">No checklist-linked content has been added to this section yet.</p>`;
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
      <thead><tr><th>Item</th><th>Section</th><th>Requirement</th><th>Status</th></tr></thead>
      <tbody>
        ${checklist.items.map((item) => `
          <tr>
            <td>${escapeHtml(item.itemNumber)}</td>
            <td>${escapeHtml(item.section)}</td>
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
    issues.push("One or more required checklist items are marked as needing clarification.");
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
  return state.projects.find((item) => item.id === state.activeProjectId);
}

function touchProject(project) {
  project.updatedAt = new Date().toISOString();
}

function showToast(message) {
  state.toast = message;
  window.clearTimeout(showToast.timer);
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
