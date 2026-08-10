# Public repository hardening

Audit date: 2026-08-10
Repository: `helgaarm/Virtual-Electronics-Workbench`

## Audit result

The repository was already public when this audit began. No repository ruleset or branch protection applied to `main`, and the repository had no GitHub Actions workflows, CODEOWNERS, security policy, contribution guide, Dependabot configuration, or pull-request template.

The audit found:

- no high-confidence secret patterns in the current tree or reachable Git history;
- no tracked environment, private-key, token-config, or local SQLite files;
- no deployment, publishing, release, or privileged automation;
- no use of `pull_request_target`, workflow secrets, or contributor-controlled workflow shell input;
- zero known npm vulnerabilities reported by `npm audit` on the locked dependency graph;
- `esbuild` and optional `fsevents` as the only locked packages declaring install scripts; and
- `private: true` in `package.json`, which prevents accidental npm publication.

No known credential needs rotation. If a secret is discovered later, revoke or rotate it before attempting Git-history cleanup.

## Repository safeguards in this change

- CI runs the repository security policy, lint, license inventory check, tests, type checking, and production build.
- Pull requests receive a dependency review that fails at moderate severity or higher.
- Every third-party action is pinned to an immutable commit SHA, checkout credentials are not persisted, and workflows have read-only repository permissions.
- Dependabot monitors npm and GitHub Actions weekly.
- CODEOWNERS assigns the maintainer globally and calls out workflows, dependency manifests, server code, configuration, and security policy.
- Contribution, security-reporting, issue, and pull-request guidance is included.
- Local environment and credential-like files are ignored while `.env.example` documents the two non-secret server options.
- `npm run check` enforces the repository workflow policy locally and in CI.

## Owner actions required in GitHub

These settings cannot be safely represented by a commit and must be completed by a repository administrator. Do them after this hardening pull request's checks have run so GitHub can find the two required check names.

### 1. Protect `main`

Go to **Settings → Rules → Rulesets**, create a branch ruleset named **Protect main**, target the default branch, and configure:

- require a pull request before merging;
- require 1 approval;
- dismiss stale approvals when new commits are pushed;
- require CODEOWNERS review;
- require all conversations to be resolved;
- require branches to be up to date;
- require status checks **Required validation** and **Dependency review**;
- block force pushes; and
- block deletion.

Add only the repository Administrator role as an always-allowed bypass actor. This preserves owner recovery while preventing ordinary contributors from bypassing the rules. The import/API payload is stored at `.github/rulesets/main.json`.

With a working GitHub CLI administrator login, create the ruleset exactly as prepared:

```powershell
gh auth refresh -h github.com -s repo
gh api --method POST -H "X-GitHub-Api-Version: 2026-03-10" repos/helgaarm/Virtual-Electronics-Workbench/rulesets --input .github/rulesets/main.json
gh api -H "X-GitHub-Api-Version: 2026-03-10" repos/helgaarm/Virtual-Electronics-Workbench/rules/branches/main
```

If the current CLI credential cannot be refreshed, run `gh auth login -h github.com -p https -w -s repo` first. Review the generated ruleset in the UI; do not delete another ruleset if one has appeared meanwhile.

### 2. Lock down GitHub Actions

Under **Settings → Actions → General**:

- set the default workflow permission to **Read repository contents and packages permissions**;
- disable **Allow GitHub Actions to create and approve pull requests**;
- allow only actions owned by GitHub, and require actions to be pinned to a full-length commit SHA if that policy is available; and
- keep approval required for first-time outside contributors.

The committed workflows request only `contents: read`, use no repository secrets, and never run privileged deployment or publishing jobs.

### 3. Enable GitHub security features

Under **Settings → Code security and analysis**, verify or enable:

- Dependabot alerts;
- Dependabot security updates;
- secret scanning;
- push protection for contributors and repository administrators;
- private vulnerability reporting; and
- CodeQL default setup for JavaScript/TypeScript.

Public repositories may receive some features automatically, but each switch must be verified. Keep private vulnerability reporting enabled so the link in `SECURITY.md` remains usable.

### 4. Configure Codex reviews

First connect the repository to Codex cloud. In **Codex settings → Code review**, enable Code review for the repository and turn on **Automatic reviews**. The root `AGENTS.md` contains repository-specific `## Code Review Rules` that Codex will apply.

Codex Security Review is a separate research-preview feature. If the workspace is eligible, under **Repository preferences** choose **Review all PRs** and **Whenever code review runs**, then set an appropriate public-reporting threshold. Findings posted to a public pull request are public, so start with High/Critical automatic findings. A manual review can be requested with `@codex security review`.

Official references:

- <https://learn.chatgpt.com/docs/third-party/github>
- <https://learn.chatgpt.com/docs/security/security-review>
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- <https://docs.github.com/en/actions/reference/security/secure-use>
- <https://docs.github.com/en/code-security/how-tos/secure-your-secrets/prevent-future-leaks/enable-push-protection>
- <https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository>

## Maintainer release checklist

Before merging a public contribution:

1. Confirm CODEOWNERS approval and resolve every review conversation.
2. Confirm **Required validation** and **Dependency review** succeed on the final commit.
3. Inspect dependency and workflow changes manually, including lockfile install scripts and action pins.
4. Verify no secrets, private paths, personal data, debug logs, or generated local data are present.
5. For schema changes, verify migration and recovery tests against a copy of an existing SQLite database.
6. For security-sensitive changes, request Codex Security Review if available and perform a human threat-boundary review.
7. Merge through the protected pull request; do not bypass protection for routine changes.
