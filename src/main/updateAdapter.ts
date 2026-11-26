import { autoUpdater } from 'electron-updater'
import type { UpdateAdapter } from './updater'

export function createElectronAdapter(): UpdateAdapter {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  return {
    checkForUpdates: async () => {
      await autoUpdater.checkForUpdates()
    },
    downloadUpdate: async () => {
      await autoUpdater.downloadUpdate()
    },
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    onAvailable: (cb) => autoUpdater.on('update-available', (info) => cb(info.version)),
    onNotAvailable: (cb) => autoUpdater.on('update-not-available', () => cb()),
    onProgress: (cb) => autoUpdater.on('download-progress', (progress) => cb(progress.percent)),
    onDownloaded: (cb) => autoUpdater.on('update-downloaded', (info) => cb(info.version)),
    onError: (cb) => autoUpdater.on('error', (error) => cb(error.message))
  }
}
