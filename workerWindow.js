const electron = require("electron");
const ipc = electron.ipcRenderer

ipc.on('restore', function(event, arg) {
    const fileName = arg[0]
    const fileType = arg[1]

    const dataRestore = require("./dataRestore")

    dataRestore.restore(fileName, fileType).then(() => {
            ipc.send('restoring-done')
        }
    )
})