# Repository Guidelines

## Project Structure & Module Organization
This repository now contains a full Docker-ready web app for meeting minutes. Keep backend logic in `server.js`, package metadata in `package.json`, and browser assets in `public/`:
- `public/index.html` defines the separated app views for login, dashboard, protocol editing, and admin-only user management
- `public/app.js` handles API calls, navigation between views, dashboard metrics, editor state, drag-and-drop ordering, Markdown import/export, user management, search, and print mode
- `public/styles.css` contains the shared UI styling
- `public/logo.jpg` contains the extracted club logo used in the app header and print layout

Operational files live at the root:
- `Dockerfile` for the application image
- `docker-compose.yml` for local development and Portainer deployment from GitHub
- `WORKLOG.md` for session-to-session progress tracking

## Build, Test, and Development Commands
Run all commands from the repository root.
- `docker compose up --build` builds and starts the app on `http://localhost:8080`
- `docker compose down` stops the local stack
- `node --check server.js` validates backend syntax
- `node --check public/app.js` validates frontend syntax

For Portainer, deploy `docker-compose.yml` from GitHub and set secure environment values before exposing the service through Nginx Proxy Manager. The host port can be overridden with `HOST_PORT`.
Login throttling is controlled with `LOGIN_RATE_LIMIT_WINDOW_MS` and `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`.

## Coding Style & Naming Conventions
Use 2 spaces in JavaScript, HTML, CSS, and YAML. Keep functions small and direct. Use:
- `camelCase` for JavaScript functions and variables
- lowercase filenames for web assets
- clear German UI labels and status messages

Prefer dependency-light solutions. Add libraries only when they materially reduce complexity.

## Testing Guidelines
Verify the full flow after meaningful changes:
- admin login works
- protocols can be created, edited, and deleted
- reader accounts can log in and add comments
- users can edit or delete only their own comments; admins can manage all comments
- user activation, password changes, and deletion work as intended
- repeated failed logins are throttled
- drag-and-drop ordering persists after save
- Markdown import/export still round-trips correctly
- protocol search and print view behave sensibly in the browser
- dashboard summary cards and recent-protocol lists update after data changes

If automated tests are added later, place them in `tests/`.

## Commit & Pull Request Guidelines
Git history is not available here, so use short imperative commit messages such as `Add reader comments` or `Persist protocols in SQLite`.

Pull requests should include:
- a summary of the functional change
- local verification notes
- screenshots for visible UI changes

## Agent-Specific Instructions
Update `WORKLOG.md` whenever you complete a meaningful step. If you change deployment, commands, roles, or storage behavior, update this guide in the same change.
