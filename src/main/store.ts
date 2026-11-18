import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'

interface StoreFile<T> {
  version: 1
  data: T
}

export class JsonStore<T> {
  private warning: string | null = null

  constructor(
    private readonly filePath: string,
    private readonly fallback: () => T,
    private readonly validate?: (value: unknown) => boolean
  ) {}

  load(): T {
    this.warning = null

    let raw: string | null = null
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch {
      // 主文件缺失或不可读；下面尝试备份。完全没有文件时视为首次运行。
    }

    if (raw !== null) {
      const parsed = this.tryParse(raw)
      if (parsed !== null) return parsed
    }

    const fromBackup = this.loadFromBackups()
    if (fromBackup !== null) {
      this.warning = '数据文件损坏，已从备份恢复'
      return fromBackup
    }

    if (raw !== null) {
      this.warning = '数据文件损坏，且没有可用备份，已使用空数据'
    }
    return this.fallback()
  }

  /**
   * 先把新内容完整写入临时文件并落盘，成功后才轮转备份并替换主文件。
   * 任一步失败时主文件仍是上一次成功保存的内容，不会留下“无主文件可读”的状态。
   */
  save(data: T): void {
    const payload: StoreFile<T> = { version: 1, data }
    const tmpPath = `${this.filePath}.tmp`
    const fd = openSync(tmpPath, 'w')
    try {
      writeFileSync(fd, JSON.stringify(payload, null, 2), 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }

    if (existsSync(this.filePath)) {
      this.rotateBackups()
    }

    renameSync(tmpPath, this.filePath)
  }

  loadWarning(): string | null {
    return this.warning
  }

  private loadFromBackups(): T | null {
    for (let i = 1; i <= 3; i += 1) {
      const backupPath = `${this.filePath}.bak${i}`
      if (!existsSync(backupPath)) continue
      try {
        const fromBackup = this.tryParse(readFileSync(backupPath, 'utf8'))
        if (fromBackup !== null) return fromBackup
      } catch {
        // 继续尝试下一份备份
      }
    }
    return null
  }

  private tryParse(raw: string): T | null {
    try {
      const parsed = JSON.parse(raw) as StoreFile<T>
      if (!parsed || typeof parsed !== 'object') return null
      if (parsed.version !== 1) return null
      if (!('data' in parsed)) return null
      if (this.validate && !this.validate(parsed.data)) return null
      return parsed.data
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
