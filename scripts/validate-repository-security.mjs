import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const failures = []

const read = async (relativePath) =>
  readFile(path.join(root, relativePath), 'utf8')

const requireFile = async (relativePath) => {
  try {
    return await read(relativePath)
  } catch {
    failures.push(`Required repository file is missing: ${relativePath}`)
    return ''
  }
}

const requireMatch = (content, pattern, message) => {
  if (!pattern.test(content)) failures.push(message)
}

const workflowDirectory = path.join(root, '.github', 'workflows')
let workflowNames = []

try {
  workflowNames = (await readdir(workflowDirectory))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
} catch {
  failures.push('The .github/workflows directory is missing.')
}

for (const workflowName of workflowNames) {
  const relativePath = `.github/workflows/${workflowName}`
  const workflow = await requireFile(relativePath)

  requireMatch(
    workflow,
    /^permissions:\r?\n {2}contents: read\s*$/mu,
    `${relativePath} must declare top-level contents: read permissions.`,
  )

  if (/\bpull_request_target\b/u.test(workflow)) {
    failures.push(`${relativePath} must not use pull_request_target.`)
  }
  if (/permissions:\s*write-all|:\s*write\s*$/mu.test(workflow)) {
    failures.push(`${relativePath} must not grant write permissions.`)
  }
  if (/\bsecrets\s*\./u.test(workflow)) {
    failures.push(`${relativePath} must not expose repository secrets.`)
  }

  const lines = workflow.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const usesMatch = lines[index].match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/u)
    if (usesMatch) {
      const action = usesMatch[1]
      if (!action.startsWith('./') && !/@[0-9a-f]{40}$/u.test(action)) {
        failures.push(
          `${relativePath}:${index + 1} must pin ${action} to a full commit SHA.`,
        )
      }
    }

    const runMatch = lines[index].match(/^(\s*)run:\s*(.*)$/u)
    if (!runMatch) continue

    const runIndent = runMatch[1].length
    let runText = runMatch[2]
    let nextIndex = index + 1
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex]
      const nextIndent = nextLine.match(/^\s*/u)?.[0].length ?? 0
      if (nextLine.trim() && nextIndent <= runIndent) break
      runText += `\n${nextLine}`
      nextIndex += 1
    }
    if (/\$\{\{/u.test(runText)) {
      failures.push(
        `${relativePath}:${index + 1} must not interpolate workflow context directly into shell commands.`,
      )
    }
  }

  if (/uses:\s*actions\/checkout@/u.test(workflow)) {
    requireMatch(
      workflow,
      /persist-credentials:\s*false/u,
      `${relativePath} must disable persisted checkout credentials.`,
    )
  }
}

if (workflowNames.length === 0) {
  failures.push('At least one validation workflow is required.')
}

const ci = await requireFile('.github/workflows/ci.yml')
requireMatch(ci, /name:\s*Required validation/u, 'CI must expose the Required validation check.')
requireMatch(ci, /npm ci --ignore-scripts/u, 'CI must install from the lockfile without lifecycle scripts.')
requireMatch(ci, /npm run check/u, 'CI must run the complete repository check.')

const dependencyReview = await requireFile('.github/workflows/dependency-review.yml')
requireMatch(
  dependencyReview,
  /fail-on-severity:\s*moderate/u,
  'Dependency review must fail at moderate severity or higher.',
)

const codeowners = await requireFile('.github/CODEOWNERS')
for (const expectedOwner of [
  '* @helgaarm',
  '/.github/workflows/ @helgaarm',
  '/package-lock.json @helgaarm',
  '/server/ @helgaarm',
]) {
  if (!codeowners.includes(expectedOwner)) {
    failures.push(`CODEOWNERS is missing: ${expectedOwner}`)
  }
}

const gitignore = await requireFile('.gitignore')
for (const ignored of ['data/', '.env', '.env.*', '.npmrc', '*.pem', '*.key']) {
  if (!gitignore.split(/\r?\n/u).includes(ignored)) {
    failures.push(`.gitignore must include ${ignored}`)
  }
}

const packageDocument = JSON.parse(await requireFile('package.json') || '{}')
if (packageDocument.private !== true) {
  failures.push('package.json must remain private to prevent accidental publication.')
}

for (const requiredFile of [
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
]) {
  await requireFile(requiredFile)
}

const rulesetText = await requireFile('.github/rulesets/main.json')
if (rulesetText) {
  try {
    const ruleset = JSON.parse(rulesetText)
    const ruleTypes = new Set(ruleset.rules?.map((rule) => rule.type))
    for (const requiredRule of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']) {
      if (!ruleTypes.has(requiredRule)) {
        failures.push(`The prepared main ruleset is missing ${requiredRule}.`)
      }
    }

    const pullRequestRule = ruleset.rules?.find((rule) => rule.type === 'pull_request')
    if (pullRequestRule?.parameters?.required_approving_review_count < 1) {
      failures.push('The prepared main ruleset must require an approval.')
    }
    if (pullRequestRule?.parameters?.require_code_owner_review !== true) {
      failures.push('The prepared main ruleset must require CODEOWNERS review.')
    }

    const statusRule = ruleset.rules?.find((rule) => rule.type === 'required_status_checks')
    const contexts = new Set(
      statusRule?.parameters?.required_status_checks?.map((check) => check.context),
    )
    for (const context of ['Required validation', 'Dependency review']) {
      if (!contexts.has(context)) failures.push(`The prepared main ruleset must require ${context}.`)
    }

    const adminBypass = ruleset.bypass_actors?.some(
      (actor) =>
        actor.actor_type === 'RepositoryRole' &&
        actor.actor_id === 5 &&
        actor.bypass_mode === 'always',
    )
    if (!adminBypass) {
      failures.push('The prepared main ruleset must preserve an administrator recovery path.')
    }
  } catch (error) {
    failures.push(`The prepared main ruleset is invalid JSON: ${error.message}`)
  }
}

if (failures.length > 0) {
  process.stderr.write('Repository security validation failed:\n')
  for (const failure of failures) process.stderr.write(`- ${failure}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(
    `Repository security validation passed (${workflowNames.length} workflows checked).\n`,
  )
}
