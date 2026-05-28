# Review Protocol Studio

Review Protocol Studio is a checklist-guided web application for developing protocols for systematic, scoping, and rapid reviews.

## Run locally

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:8093
```

The prototype is dependency-light and stores projects in browser `localStorage`.

When run with `npm run dev`, the app uses `backend/server.py` for SQLite-backed accounts, sessions, and project storage. If opened as a static file or on GitHub Pages without the backend, it falls back to browser-local prototype accounts.

## GitHub Pages

The app can be served from GitHub Pages using the included workflow at `.github/workflows/pages.yml`.

## What is included

- Project dashboard with create, open, duplicate, delete, protocol export, and checklist report export actions.
- Browser-based prototype accounts with sign-up, sign-in, sign-out, and account-specific project lists.
- Editable account profiles with name, institution, title, and email fields.
- SQLite-backed local backend for real account/session/project persistence during development.
- Ten review types: systematic, scoping, rapid, evidence and gap map, qualitative evidence synthesis, mixed-methods, umbrella, review of reviews, realist, and living systematic review protocols.
- Checklist seed files in `data/checklists/`.
- Dynamic prompt rendering from checklist JSON data.
- Protocol builder with sections, response fields, status controls, completeness tracking, consistency checks, and preview.
- Editable Word export using a Word-compatible `.doc` document.
- Checklist compliance report export as CSV.

## Extend with another checklist

1. Add a JSON file to `data/checklists/`.
2. Follow the existing checklist schema: `reviewType`, `label`, `framework`, `sections`, and `items`.
3. Register the file in `app.js` inside `CHECKLIST_MANIFEST`.

Checklist items are intentionally not hard-coded inside UI components.
