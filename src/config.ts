import { existsSync } from "fs"
import { readFile } from "fs/promises"
import * as path from "path"
import * as core from "@actions/core"
import { getInput } from "action-input-parser"
import type { InputValue } from "action-input-parser/lib/types"
import * as yaml from "js-yaml"
import type { Dict } from "./assertion"
import { isArray, isString, isUndefined } from "./assertion"

const REPLACE_DEFAULT = true
let context: Record<string, InputValue>

try {
  context = {
    GITHUB_TOKEN: getInput("GITHUB_TOKEN", {
      required: true,
    }),
    GIT_EMAIL: getInput("GIT_EMAIL", {}),
    GIT_USERNAME: getInput("GIT_USERNAME", {}),
    CONFIG_PATH: getInput("CONFIG_PATH", {
      default: ".github/sync.yml",
    }),
    COMMIT_BODY: getInput("COMMIT_BODY", {
      default: "",
    }),
    PR_TITLE: getInput("PR_TITLE", {}),
    COMMIT_EACH_FILE: getInput("COMMIT_EACH_FILE", {
      type: "boolean",
      default: true,
    }),
    PR_LABELS: getInput("PR_LABELS", {
      default: ["sync"],
      type: "array",
      disableable: true,
    }),
    TARGET_BRANCH: getInput("TARGET_BRANCH", {}),
    ASSIGNEES: getInput("ASSIGNEES", {
      type: "array",
    }),
    TMP_DIR: getInput("TMP_DIR", {
      default: `tmp-${Date.now().toString()}`,
    }),
    DRY_RUN: getInput("DRY_RUN", {
      type: "boolean",
      default: false,
    }),
    SKIP_CLEANUP: getInput("SKIP_CLEANUP", {
      type: "boolean",
      default: false,
    }),
    OVERWRITE_EXISTING_PR: getInput("OVERWRITE_EXISTING_PR", {
      type: "boolean",
      default: true,
    }),
    GITHUB_REPOSITORY: getInput("GITHUB_REPOSITORY", {
      required: true,
    }),
    SKIP_PR: getInput("SKIP_PR", {
      type: "boolean",
      default: false,
    }),
    BRANCH_PREFIX: getInput("BRANCH_PREFIX", {
      default: "repo-sync/SOURCE_REPO_NAME",
    }),
  }

  if (isString(context.GITHUB_TOKEN)) {
    core.setSecret(context.GITHUB_TOKEN)
  } else {
    throw new Error("Failed: Not found GITHUB_TOKEN")
  }

  core.debug(JSON.stringify(context, null, 2))

  if (isString(context.TMP_DIR)) {
    while (existsSync(context.TMP_DIR)) {
      context.TMP_DIR = `tmp-${Date.now().toString()}`
      core.warning(`TEMP_DIR already exists. Using "${context.TMP_DIR}" now.`)
    }
  } else {
    throw new Error("Failed: Not found TMP_DIR")
  }
} catch (e) {
  if (e instanceof Error) core.setFailed(e.message)

  process.exit(1)
}

export { context }

const parseRepoName = (fullRepo: string) => {
  let host = "github.com"

  if (fullRepo.startsWith("http")) {
    const url = new URL(fullRepo)
    host = url.host

    fullRepo = url.pathname.replace(/^\/+/, "")

    core.info("Using custom host")
  }

  const [user, repoBranch] = fullRepo.split("/")
  const [name, branch = "default"] = repoBranch.split("@")

  return {
    fullName: `${host}/${user}/${name}`,
    uniqueName: `${host}/${user}/${name}@${branch}`,
    host,
    user,
    name,
    branch,
  }
}

const parseExclude = (text: string | undefined, src: string) => {
  if (text === undefined || typeof text !== "string") return undefined

  const files = text.split("\n").filter((i) => i)

  return files.map((file) => path.join(src, file))
}

const parseFiles = (files: any[]) =>
  files.map((item) => {
    if (isString(item)) {
      return {
        source: item,
        dest: item,
        replace: REPLACE_DEFAULT,
      }
    }

    if (!isUndefined(item.source)) {
      return {
        source: item.source,
        dest: !isUndefined(item.dest) ? item.dest : item.source,
        replace: !isUndefined(item.replace) ? item.replace : REPLACE_DEFAULT,
        exclude: parseExclude(item.exclude, item.source),
      }
    }

    core.warning("Warn: No source files specified")
  })

export const parseConfig = async (): Promise<any[]> => {
  try {
    let fileContent = ""

    if (isString(context.CONFIG_PATH)) {
      fileContent = await readFile(context.CONFIG_PATH, "utf-8")
    } else {
      throw new Error("Failed: Not found CONFIG_PATH")
    }

    const config = yaml.load(fileContent) as Dict

    const result: Dict = {}

    Object.keys(config).forEach((key) => {
      if (key === "group") {
        const raw = config[key]

        const groups = isArray(raw) ? raw : [raw]

        groups.forEach((group) => {
          const repos: string[] = isString(group.repos)
            ? group.repos.split("\n").filter(Boolean)
            : group.repos

          repos.forEach((name) => {
            const files = parseFiles(group.files)
            const repo = parseRepoName(name)

            if (!isUndefined(result[repo.uniqueName])) {
              result[repo.uniqueName].files.push(...files)

              return
            }

            result[repo.uniqueName] = { repo, files }
          })
        })
      } else {
        const files = parseFiles(config[key])
        const repo = parseRepoName(key)

        if (!isUndefined(result[repo.uniqueName])) {
          result[repo.uniqueName].files.push(...files)

          return
        }

        result[repo.uniqueName] = { repo, files }
      }
    })

    return Object.values(result)
  } catch (e) {
    if (e instanceof Error) core.setFailed(e.message)

    process.exit(1)
  }
}
