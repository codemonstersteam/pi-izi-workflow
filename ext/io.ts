// MODULE_CONTRACT: io — чтение/запись файлов против cwd прогона
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs"
import { join } from "node:path"

export const readAt = (cwd: string, rel: string): string =>
  existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), "utf8") : ""

export const writeAt = (cwd: string, rel: string, content: string): void => {
  mkdirSync(join(cwd, rel, ".."), { recursive: true })
  writeFileSync(join(cwd, rel), content)
}

export const existsAt = (cwd: string, rel: string): boolean => existsSync(join(cwd, rel))

export const copyAt = (cwd: string, from: string, to: string): void => {
  mkdirSync(join(cwd, to, ".."), { recursive: true })
  copyFileSync(join(cwd, from), join(cwd, to))
}
