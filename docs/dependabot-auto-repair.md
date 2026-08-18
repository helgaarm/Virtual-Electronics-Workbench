# Dependabot automatic repair

The repository can repair one known, deterministic Dependabot failure without an OpenAI API key:
a stale `THIRD_PARTY_LICENSES.md` after an npm dependency update. This is repository automation,
not an open-ended AI agent.

## Behavior

After the `CI` workflow fails, `dependabot-auto-repair.yml` runs only when all of these conditions
hold:

- the failed run came from an open, same-repository Dependabot npm pull request targeting `main`;
- the branch starts with `dependabot/npm_and_yarn/`;
- the failed log contains the exact stale-license-inventory error; and
- the pull request changes only `package.json`, `package-lock.json`, and optionally
  `THIRD_PARTY_LICENSES.md`, with `package-lock.json` always present.

The workflow installs the locked dependency graph with lifecycle scripts disabled, invokes the
fixed license generator directly, and refuses to continue unless the only generated change is
`THIRD_PARTY_LICENSES.md`. It makes one normal (never forced) push to the existing Dependabot branch.

GitHub does not start workflows from a push made with the built-in `GITHUB_TOKEN`. The repair
therefore explicitly dispatches both required workflows against the repaired commit. `CI` performs
the complete repository check with read-only permissions. Dependency review compares the original
base commit with the repaired head commit. No repository secret, personal access token, or OpenAI
credential is used.

The repair workflow deliberately ignores every other failure. For those cases, use Codex Cloud
from the pull request (for example, comment `@codex fix the CI failures`) after reviewing the scope.
Codex Cloud access is included with supported ChatGPT plans, while a fully autonomous custom
AI workflow would require separate API or GitHub App credentials.

Relevant service documentation:

- [Codex and GitHub](https://learn.chatgpt.com/docs/third-party/github)
- [GitHub `GITHUB_TOKEN` event behavior](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub workflow chaining security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
