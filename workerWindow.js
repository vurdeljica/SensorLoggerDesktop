const electron = require("electron");
const ipc = electron.ipcRenderer
const dataRestore = require("./dataRestore")

ipc.on('initWorker', function(event, arg) {
    dataRestore.init(false)
})

ipc.on('restore', function(event, arg) {
    const fileName = arg[0]
    const fileType = arg[1]

    dataRestore.restore(fileName, fileType).then(() => {
            ipc.send('restoring-done')
        })
        .catch(err => ipc.send('data-restore-error', fileName))
    })


ipc.on('finishWorker', function(event, arg) {
    dataRestore.finish()
})