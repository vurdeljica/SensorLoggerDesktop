const electron = require("electron");
const ipc = electron.ipcRenderer
const dataRestore = require("./dataRestore")

/**
 * Receives command from browser process to initialize
 * data restore
 */
ipc.on('initWorker', function(event, arg) {
    dataRestore.init(false)
})

/**
 * Receives command from browser process to restore binary file
 * 
 * @param {String} arg Path of the file which should be restored
 */
ipc.on('restore', function(event, arg) {
    const fileName = arg[0]
    const fileType = arg[1]

    dataRestore.restore(fileName, fileType).then(() => {
            ipc.send('restoring-done')
        })
        .catch((err) => ipc.send('data-restore-error', fileName))
    })


/**
 * Receives command from browser process to finish
 * data restore
 */
ipc.on('finishWorker', function(event, arg) {
    dataRestore.finish()
})