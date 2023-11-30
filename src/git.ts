import path from "path"
import * as core from "@actions/core"
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils"
import { throttling } from "@octokit/plugin-throttling"
import { parse } from "@putout/git-status-porcelain"
import { isUndefined } from "./assertion"
import { context } from "./config"
import { dedent, execCmd } from "./helpers"

const {
  PR_TITLE,
  GITHUB_TOKEN,
  GIT_USERNAME,
  GIT_EMAIL,
  TMP_DIR,
  COMMIT_BODY,
  GITHUB_REPOSITORY,
  OVERWRITE_EXISTING_PR,
  BRANCH_PREFIX,
} = context

export default class Git {
  github: any
  existingPr: any
  prBranch: string | undefined
  baseBranch: string | undefined
  repo: any
  workingDir: string | undefined
  gitUrl: string | undefined

  constructor() {
    const Octokit = GitHub.plugin(throttling)

    const options = getOctokitOptions(GITHUB_TOKEN as string, {
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          core.warning(
            `Request quota exhausted for request ${options.method} ${options.url}`,
          )

          if (options.request.retryCount === 0) {
            core.info(`Retrying after ${retryAfter} seconds!`)

            return true
          }
        },
        onAbuseLimit: (retryAfter: number, options: any) => {
          core.warning(
            `Abuse detected for request ${options.method} ${options.url}`,
          )
        },
      },
    })

    const octokit = new Octokit(options)

    this.github = octokit.rest
  }

  async initRepo(repo: any) {
    this.existingPr = undefined
    this.prBranch = undefined
    this.baseBranch = undefined

    this.repo = repo
    this.workingDir = path.join(TMP_DIR as string, repo.uniqueName)
    this.gitUrl = `https://${GITHUB_TOKEN}@${repo.fullName}.git`

    await this.clone()
    await this.setIdentity()
    await this.getBaseBranch()
  }

  async clone() {
    core.debug(`Cloning ${this.repo.fullName} into ${this.workingDir}`)

    return execCmd(
      `git clone --depth 1 ${
        this.repo.branch !== "default"
          ? '--branch "' + this.repo.branch + '"'
          : ""
      } ${this.gitUrl} ${this.workingDir}`,
    )
  }

  async setIdentity() {
    let username = GIT_USERNAME
    let email = GIT_EMAIL

    if (email === undefined) {
      const { data } = await this.github.users.getAuthenticated()
      email = data.email
      username = data.login
    }

    core.debug(`Setting git user to email: ${email}, username: ${username}`)

    return execCmd(
      `git config --local user.name "${username}" && git config --local user.email "${email}"`,
      this.workingDir,
    )
  }

  async getBaseBranch() {
    this.baseBranch = await execCmd(
      `git rev-parse --abbrev-ref HEAD`,
      this.workingDir,
    )
  }

  async createPrBranch() {
    const prefix = (BRANCH_PREFIX as string).replace(
      "SOURCE_REPO_NAME",
      (GITHUB_REPOSITORY as string).split("/")[1],
    )

    let newBranch = path.join(prefix, this.repo.branch)

    if (!OVERWRITE_EXISTING_PR) {
      newBranch += `-${Math.round(new Date().getTime() / 1000)}`
    }

    core.debug(`Creating PR Branch ${newBranch}`)

    await execCmd(`git checkout -b "${newBranch}"`, this.workingDir)

    this.prBranch = newBranch
  }

  async add(file: string) {
    return execCmd(`git add -f ${file}`, this.workingDir)
  }

  async hasChanges() {
    const statusOutput = await execCmd(
      `git status --porcelain`,
      this.workingDir,
    )

    return parse(statusOutput).length !== 0
  }

  async commit(message?: string) {
    message = !isUndefined(message)
      ? message
      : `Synced file(s) with ${GITHUB_REPOSITORY}`

    if (COMMIT_BODY) {
      message += `\n\n${COMMIT_BODY}`
    }

    return execCmd(`git commit -m "${message}"`, this.workingDir)
  }

  async status() {
    return execCmd(`git status`, this.workingDir)
  }

  async push() {
    return execCmd(`git push ${this.gitUrl} --force`, this.workingDir)
  }

  async getLastCommitMsg(filePath: string) {
    return execCmd(`git log -1 --pretty='%s' ${filePath}`, this.workingDir)
  }

  async findExistingPr() {
    const { data } = await this.github.pulls.list({
      owner: this.repo.user,
      repo: this.repo.name,
      state: "open",
      head: `${this.repo.user}:${this.prBranch}`,
    })

    this.existingPr = data[0]

    return this.existingPr
  }

  async setPrWarning() {
    await this.github.pulls.update({
      owner: this.repo.user,
      repo: this.repo.name,
      pull_number: this.existingPr.number,
      body: dedent(`
				⚠️ This PR is being automatically resynced ⚠️

				${this.existingPr.body}
			`),
    })
  }

  async removePrWarning() {
    await this.github.pulls.update({
      owner: this.repo.user,
      repo: this.repo.name,
      pull_number: this.existingPr.number,
      body: this.existingPr.body.replace(
        "⚠️ This PR is being automatically resynced ⚠️",
        "",
      ),
    })
  }

  async createOrUpdatePr(changedFiles: string[]) {
    const body = dedent(`
			Synced local file(s) with [${GITHUB_REPOSITORY}](https://github.com/${GITHUB_REPOSITORY}).

			${changedFiles.join("\n")}

			---

			This PR was created automatically by the [repo-file-sync-action](https://github.com/BetaHuhn/repo-file-sync-action) workflow run [#${
        process.env.GITHUB_RUN_ID || 0
      }](https://github.com/${GITHUB_REPOSITORY}/actions/runs/${
        process.env.GITHUB_RUN_ID || 0
      })
		`)

    if (this.existingPr) {
      core.info(`Overwriting existing PR`)

      const { data } = await this.github.pulls.update({
        owner: this.repo.user,
        repo: this.repo.name,
        pull_number: this.existingPr.number,
        body: body,
      })

      return data
    }

    core.info(`Creating new PR`)

    const { data } = await this.github.pulls.create({
      owner: this.repo.user,
      repo: this.repo.name,
      title: PR_TITLE ?? `Synced file(s) with ${GITHUB_REPOSITORY}`,
      body: body,
      head: this.prBranch,
      base: this.baseBranch,
    })

    this.existingPr = data

    return data
  }

  async addPrLabels(labels: (string | number | boolean)[]) {
    await this.github.issues.addLabels({
      owner: this.repo.user,
      repo: this.repo.name,
      issue_number: this.existingPr.number,
      labels,
    })
  }

  async addPrAssignees(assignees: (string | number | boolean)[]) {
    await this.github.issues.addAssignees({
      owner: this.repo.user,
      repo: this.repo.name,
      issue_number: this.existingPr.number,
      assignees,
    })
  }
}
