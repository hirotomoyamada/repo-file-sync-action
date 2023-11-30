import { existsSync } from "fs"
import * as core from "@actions/core"
import type { Dict } from "./assertion"
import { isArray } from "./assertion"
import { context, parseConfig } from "./config"
import Git from "./git"
import {
  forEach,
  dedent,
  addTrailingSlash,
  pathIsDirectory,
  copy,
  remove,
} from "./helpers"

const {
  OVERWRITE_EXISTING_PR,
  DRY_RUN,
  COMMIT_EACH_FILE,
  SKIP_CLEANUP,
  TMP_DIR,
  SKIP_PR,
  ASSIGNEES,
  PR_LABELS,
} = context

const run = async (): Promise<void> => {
  const git = new Git()

  const repos = await parseConfig()

  await forEach(repos, async ({ repo, files }: any) => {
    core.info(`Repository Info`)
    core.info(`Slug: ${repo.name}`)
    core.info(`Owner: ${repo.user}`)
    core.info(`Https Url: https://${repo.fullName}`)
    core.info(`Branch: ${repo.branch}`)
    core.info("	")

    try {
      await git.initRepo(repo)

      let existingPr

      if (!SKIP_PR) {
        await git.createPrBranch()

        existingPr = OVERWRITE_EXISTING_PR
          ? await git.findExistingPr()
          : undefined

        if (existingPr && !DRY_RUN) {
          core.info(`Found existing PR ${existingPr.number}`)

          await git.setPrWarning()
        }
      }

      core.info(`Locally syncing file(s) between source and target repository`)

      const modified: { dest: string; source?: string; message?: string }[] = []

      await forEach(files, async ({ source, dest, replace, exclude }: any) => {
        const fileExists = existsSync(source)

        if (!fileExists) return core.warning(`Source ${source} not found`)

        const localDestination = `${git.workingDir}/${dest}`

        const destExists = existsSync(localDestination)

        if (destExists && !replace)
          return core.warning(
            `File(s) already exist(s) in destination and 'replace' option is set to false`,
          )

        const isDirectory = await pathIsDirectory(source)

        if (isDirectory) core.warning(`Source is directory`)

        await copy(
          isDirectory ? `${addTrailingSlash(source)}` : source,
          localDestination,
          isDirectory,
          exclude,
        )

        await git.add(dest)

        if (COMMIT_EACH_FILE === true) {
          const hasChanges = await git.hasChanges()

          if (!hasChanges) return core.debug("File(s) already up to date")

          core.debug(`Creating commit for file(s) ${dest}`)

          const directory = isDirectory ? "directory" : ""
          const otherFiles = isDirectory
            ? "and copied all sub files/folders"
            : ""

          const message: Dict<Dict<string>> = {
            true: {
              commit: `Synced local '${dest}' with remote '${source}'`,
              pr: `Synced local ${directory} <code>${dest}</code> with remote ${directory} <code>${source}</code>`,
            },
            false: {
              commit: `Created local '${dest}' from remote '${source}'`,
              pr: `Created local ${directory} <code>${dest}</code> ${otherFiles} from remote ${directory} <code>${source}</code>`,
            },
          }

          const { commit, pr } = message[String(destExists)]

          await git.commit(commit)

          modified.push({ dest, source, message: pr })
        }
      })

      if (DRY_RUN) {
        core.warning("Dry run, no changes will be pushed")

        core.debug("Git Status:")
        core.debug(await git.status())

        return
      }

      const hasChanges = await git.hasChanges()

      if (hasChanges === false && modified.length < 1) {
        core.info("File(s) already up to date")

        if (existingPr) await git.removePrWarning()

        return
      }

      if (hasChanges === true) {
        core.debug(`Creating commit for remaining files`)

        await git.commit()

        if (git.workingDir) modified.push({ dest: git.workingDir })
      }

      core.info(`Pushing changes to target repository`)

      await git.push()

      if (!SKIP_PR) {
        const changedFiles = dedent(`
					<details>
					<summary>Changed files</summary>
					<ul>
					${modified.map((file) => `<li>${file.message}</li>`).join("")}
					</ul>
					</details>
				`)

        const pullRequest = await git.createOrUpdatePr(
          COMMIT_EACH_FILE ? [changedFiles] : [],
        )

        core.info(
          `Pull Request #${pullRequest.number} created/updated: ${pullRequest.html_url}`,
        )

        core.setOutput("pull_request_number", pullRequest.number)
        core.setOutput("pull_request_url", pullRequest.html_url)

        if (isArray(PR_LABELS) && PR_LABELS.length > 0) {
          core.info(`Adding label(s) "${PR_LABELS.join(", ")}" to PR`)

          await git.addPrLabels(PR_LABELS)
        }

        if (isArray(ASSIGNEES) && ASSIGNEES.length > 0) {
          core.info(`Adding assignee(s) "${ASSIGNEES.join(", ")}" to PR`)

          await git.addPrAssignees(ASSIGNEES)
        }
      }

      core.info("	")
    } catch (err: any) {
      core.error(err.message)
      core.error(err)
    }
  })

  if (SKIP_CLEANUP === true) {
    core.info("Skipping cleanup")

    return
  }

  await remove(TMP_DIR)

  core.info("Cleanup complete")
}

run()
  .then(() => {})
  .catch((e) => {
    core.error("ERROR", e)
    core.setFailed(e.message)
  })
