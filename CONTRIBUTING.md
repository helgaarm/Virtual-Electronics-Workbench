# Contributing

Thank you for helping improve Virtual Electronics Workbench. Small, focused changes with clear tests are easiest to review.

## Before you start

- Use Node.js 24 or newer and npm 11 or newer.
- Search existing issues and pull requests before starting duplicate work.
- For a large feature, open an issue first so the design and scope can be discussed.
- Never put credentials, private project files, personal data, or vulnerability details in an issue, commit, test fixture, screenshot, or log.

Security vulnerabilities follow the private process in [SECURITY.md](SECURITY.md), not the public issue tracker.

## Local setup

```powershell
git clone https://github.com/helgaarm/Virtual-Electronics-Workbench.git
cd Virtual-Electronics-Workbench
npm ci
npm run check
```

The application needs no external service or secret for local development. Copy `.env.example` to `.env` only when you want to override the local port or SQLite path. Do not commit `.env` files.

Useful commands:

- `npm run dev` starts the SQLite API and Vite development server.
- `npm run build` type-checks and creates the production frontend build.
- `npm test` runs the unit and integration tests.
- `npm run lint` runs strict TypeScript and React linting.
- `npm run check` runs the complete local validation used by CI.

## Make a change

1. Fork the repository and create a descriptive branch from current `main`.
2. Keep the change focused; avoid unrelated formatting or generated-file churn.
3. Follow [AGENTS.md](AGENTS.md) and the architecture documentation under `docs/`.
4. Add or update tests for changed behavior.
5. Run `npm run check` before pushing.
6. Complete the pull-request template honestly and respond to review feedback.

Use strict TypeScript, keep units explicit in identifiers, preserve stable persisted IDs and schema migrations, and keep simulation logic out of React/rendering code. See [AGENTS.md](AGENTS.md) for the complete repository conventions.

Do not rewrite shared history, force-push over another person's work, or include generated `dist`, coverage, local SQLite, or environment files.

## Dependency changes

Use `npm install <package>` so `package.json` and `package-lock.json` remain synchronized. Before proposing a dependency:

- explain why existing code or dependencies are insufficient;
- review the package owner, maintenance activity, release history, and install scripts;
- run `npm audit` and `npm run licenses:generate`;
- verify that the license is compatible with this MIT-licensed project; and
- include the regenerated `THIRD_PARTY_LICENSES.md` when the production dependency graph changes.

CI also reviews dependency changes and fails on moderate-or-higher known vulnerabilities.

## Review expectations

At least one approving review, resolved conversations, and the required CI checks are expected before merge. CODEOWNERS review is required for sensitive files. Maintainers may close changes that are unsafe, untestable, out of scope, or incompatible with the educational nature of the simulator.

By submitting a contribution, you agree that it is licensed under this repository's [MIT License](LICENSE).
