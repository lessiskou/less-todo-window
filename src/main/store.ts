import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'

interface StoreFile<T> {
  version: 1
  data: T
}

export class JsonStore<T> {
  private warning: string | null = null

  constructor(
    private readonly filePath: string,
    private readonly fallback: () => T
  ) {}

  load(): T {
    this.warning = null

    let raw: string | null = null
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch {
      return this.fallback()
    }

    const parsed = this.tryParse(raw)
    if (parsed !== null) return parsed

    for (let i = 1; i <= 3; i += 1) {
      const backupPath = `${this.filePath}.bak${i}`
      if (!existsSync(backupPath)) continue
      try {
        const fromBackup = this.tryParse(readFileSync(backupPath, 'utf8'))
        if (fromBackup !== null) {
          this.warning = '数据文件损坏，已从备份恢复'
          return fromBackup
        }
      } catch {
        // 继续尝试下一份备份
      }
    }

    this.warning = '数据文件损坏，且没有可用备份，已使用空数据'
    return this.fallback()
  }

  save(data: T): void {
    if (existsSync(this.filePath)) {
      this.rotateBackups()
    }

    const payload: StoreFile<T> = { version: 1, data }
    const tmpPath = `${this.filePath}.tmp`
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8')
    renameSync(tmpPath, this.filePath)
  }

  loadWarning(): string | null {
    return this.warning
  }

  private tryParse(raw: string): T | null {
    try {
      const parsed = JSON.parse(raw) as StoreFile<T>
      if (parsed && typeof parsed === 'object' && 'data' in parsed) {
        return parsed.data
      }
      return null
    } catch {
      return null
    }
  }

  private rotateBackups(): void {
    const bak3 = `${this.filePath}.bak3`
    if (existsSync(bak3)) rmSync(bak3)

    for (let i = 2; i >= 1; i -= 1) {
      const from = `${this.filePath}.bak${i}`
      const to = `${this.filePath}.bak${i + 1}`
      if (existsSync(from)) renameSync(from, to)
    }

    renameSync(this.filePath, `${this.filePath}.bak1`)
  }
}
