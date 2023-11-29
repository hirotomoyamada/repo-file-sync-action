import { exec } from "child_process"
import { lstat } from "fs/promises"
import * as core from "@actions/core"
import type { InputValue } from "action-input-parser/lib/types"
import * as fs from "fs-extra"
import readfiles from "node-readfiles"
import { isString, isUndefined } from "./assertion"

export const forEach = async (
  array: any[],
  callback: (item: any, index: number, array: any[]) => Promise<void>,
): Promise<void> => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

export const dedent = (
  templateStrings: TemplateStringsArray | string,
  ...values: any[]
): string => {
  const matches: RegExpMatchArray[] = []
  const strings = isString(templateStrings)
    ? [templateStrings]
    : Array.from(templateStrings)

  strings[strings.length - 1] = strings[strings.length - 1].replace(
    /\r?\n([\t ]*)$/,
    "",
  )

  for (let i = 0; i < strings.length; i++) {
    const match = strings[i].match(/\n[\t ]+/g)

    // @ts-ignore
    if (match) matches.push(...match)
  }

  if (matches.length) {
    const size = Math.min(...matches.map((value) => value.length - 1))
    const pattern = new RegExp(`\n[\t ]{${size}}`, "g")

    for (let i = 0; i < strings.length; i++) {
      strings[i] = strings[i].replace(pattern, "\n")
    }
  }

  strings[0] = strings[0].replace(/^\r?\n/, "")

  let string = strings[0]

  for (let i = 0; i < values.length; i++) {
    string += values[i] + strings[i + 1]
  }

  return string
}

export const execCmd = (
  command: string,
  workingDir?: string,
): Promise<string> => {
  core.debug(`EXEC: "${command}" IN ${workingDir}`)

  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: workingDir,
      },
      (error: Error | null, stdout: string) => {
        error ? reject(error) : resolve(stdout.trim())
      },
    )
  })
}

export const addTrailingSlash = (str: string): string =>
  str.endsWith("/") ? str : `${str}/`

export const pathIsDirectory = async (path: string): Promise<boolean> => {
  const stat = await lstat(path)

  return stat.isDirectory()
}

export const copy = async (
  src: string,
  dest: string,
  isDirectory: boolean,
  exclude?: string[],
): Promise<void> => {
  core.debug(`CP: ${src} TO ${dest}`)

  const filter = (file: string): boolean => {
    if (exclude && exclude.includes(file)) {
      core.debug(`Excluding file ${file}`)

      return false
    }

    return true
  }

  await fs.copy(src, dest, isUndefined(exclude) ? { filter } : undefined)

  if (isDirectory) {
    const srcFileList = await readfiles(src, { readContents: false })
    const destFileList = await readfiles(dest, { readContents: false })

    for (const file of destFileList) {
      if (!srcFileList.includes(file)) {
        core.debug(`Found a deleted file in the source repo - ${dest}${file}`)

        await fs.remove(`${dest}${file}`)
      }
    }
  }
}

export const remove = async (path: InputValue): Promise<void> => {
  if (!isString(path)) return

  core.debug(`RM: ${path}`)

  return fs.remove(path)
}
