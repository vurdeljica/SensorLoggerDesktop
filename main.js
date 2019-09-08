const electron = require('electron');
const url = require('url');
const path = require('path');
const ipc = electron.ipcMain
const fileSystem = require('fs')
var bonjour = require('bonjour-hap')();
const portfinder = require('portfinder')
const http = require('http');
const formidable = require('formidable')
const dataRestore = require("./dataRestore")

const {app, BrowserWindow, Menu, dialog} = electron;

const EXPORT_DIRECTORY_NAME = "export"
const EXPORT_DIRECTORY = "./" + EXPORT_DIRECTORY_NAME
const UPLOAD_DIRECTORY = "./upload"
const DATA_DIRECTORY = "./data"

let mainWindow = null;
let workerWindow = null;
let loadedDBPath = ""
var fileTransferServer = undefined, sockets = {}, nextSocketId = 0

process.on("uncaughtException", (err) => {
    // uncaught Exception will occur when user tries to force quit application while uploading database
    const messageBoxOptions = {
         type: "error",
         title: "Error in Main process",
         message: "Something failed"
     };
     
     console.log(err)
 });

function initDirectoryStructure() {
    if (!fileSystem.existsSync('./upload')) {
        fileSystem.mkdirSync('./upload')
    }
    if (!fileSystem.existsSync('./export')) {
        fileSystem.mkdirSync('./export')
    }
    if (!fileSystem.existsSync('./data')) {
        fileSystem.mkdirSync('./data')
    }
}

function emptyDirectory(directoryPath) {
    fileSystem.readdir(directoryPath, (err, files) => {
        if (err) throw err;

        for (const file of files) {
            fileSystem.unlinkSync(path.join(directoryPath, file))
        }
    });
}

function makeHiddenWindow() {
    workerWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
        },
        minHeight: 700,
        minWidth: 1100,
        show: true
    });

    workerWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'workerWindow.html'),
        protocol:'file:',
        slashes: true
    }));
}

function makeGraphdWindow(windowTitle) {
    var graphWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            additionalArguments: [windowTitle]
        },
        minHeight: 700,
        minWidth: 1100,
        show: false
    });

    graphWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'graph.html'),
        protocol:'file:',
        slashes: true
    }));

    graphWindow.setMenu(null)

    graphWindow.webContents.on('did-finish-load', function() {
        graphWindow.show();
    });

}

function emptyAllDirectories() {
    try {
        if (mainWindow != null) {
            mainWindow.webContents.send('app-is-closing');
        }

        emptyDirectory(EXPORT_DIRECTORY)
        emptyDirectory(UPLOAD_DIRECTORY)
        emptyDirectory(DATA_DIRECTORY)
    }
    catch(err) {
        console.log("Error ocurred while trying to delete directories")
    }
}

// Listen for app to be ready
app.on('ready', function() {
    initDirectoryStructure()
    emptyAllDirectories()

    // Create new window
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
        },
        minHeight: 700,
        minWidth: 1100,
        show: false
    });

    mainWindow.on('close', function() {
        emptyAllDirectories()
    });

    // Load html into window
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol:'file:',
        slashes: true
    }));

    mainWindow.webContents.on('did-finish-load', function() {
        mainWindow.show();
    });

    makeHiddenWindow()

    // Build menu from template
    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    // Insert menu
    Menu.setApplicationMenu(mainMenu);
});

// Create menu template
const mainMenuTemplate = [
    {
        label: 'File', 
        submenu: [
            {
                label: 'Save as',
                click() {
                    if (loadedDBPath === "") {
                        return;
                    }

                    const options = { defaultPath: app.getPath('documents') }
                    dialog.showSaveDialog(null, options, (destination) => {
                        if(typeof destination !== "undefined") {
                            copyFile(loadedDBPath, destination)
                        }
                    });
                }
            },
            {
                label: 'Convert to',
                submenu : [
                    {
                        label: 'CSV',
                        click() {
                            if (loadedDBPath === "") {
                                return;
                            }

                            exportDatabase("csv")
                        }
                    },
                    {
                        label: 'JSON',
                        click() {
                            if (loadedDBPath === "") {
                                return;
                            }

                            exportDatabase("json")
                        }
                    }
                ]
            },
            {
                type: 'separator'
            },
            {
                label: 'Quit',
                accelerator: process.platfrom == 'darwin' ? 'Command+Q' : 'Ctrl+Q',
                click() {
                    app.quit();
                }
            }
        ]
    },
    {
        label: 'View',
        submenu: [
            {
                label: 'Home',
                click() {
                    loadedDBPath = ""
                    clearDeviceSubmenu();
                    closeServer();
                    mainWindow.webContents.send('show-home-page');
                }
            },
            {
                label: 'Visualize data',
                submenu : [
                    {   
                        label: "Mobile sensors",
                        click() {
                            if (loadedDBPath === "") {
                                return;
                            }

                            makeGraphdWindow('mobile_data');
                        }
                    },
                    {   
                        label: "Device sensors",
                        submenu: []
                    }
                ]
            },
            {
                role: 'togglefullscreen'
            },
            {
                role: 'toggledevtools'
            }
        ]
    },
    {
        label: 'Window',
        submenu: [
            {
                role: 'minimize'
            },
            {
                role: 'close'
            }
        ]
    }
];

function addDeviceSubMenu(deviceList) {
    deviceSubmenu = []
    for(var i = 0; i < deviceList.length; i++) {
        const name = deviceList[i]
        deviceSubmenu.push({ label: name, click() {
            if (loadedDBPath === "") {
                return;
            }
            makeGraphdWindow(name)
        } })
    }

    mainMenuTemplate[1].submenu[1].submenu[1].submenu = deviceSubmenu
    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    Menu.setApplicationMenu(mainMenu);
}

function clearDeviceSubmenu() {
    mainMenuTemplate[1].submenu[1].submenu[1].submenu = []
    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    Menu.setApplicationMenu(mainMenu);
}

function copyFile(source, destination) {
    fileSystem.copyFile(source, destination, (err) => {
        if (err) {
            notifyUser("Save as failed! Please try again.")
        }
      });
}

var isConversionStarted = false

function exportDatabase(exportType) {
    if (isConversionStarted) {
        notifyUser("Can not start new conversion. Conversion is already in progress!")
        return
    }

    emptyDirectory(EXPORT_DIRECTORY)
    notifyUser("Conversion started!")

    isConversionStarted = true

    const SqliteConverter  =  require("./sqlite-converter");
    let filePath  =  loadedDBPath;
    let outputPath  =  EXPORT_DIRECTORY;
    let logPath  =  EXPORT_DIRECTORY;
    let sqliteConverter  =  new SqliteConverter()
                .setFilePath(filePath)
                .setOutputPath(outputPath)
                .setLogPath(logPath);

    if (exportType === "csv") {
        sqliteConverter.convertToCSV().then((result) => {
            notifyConversionIsDone()
            isConversionStarted = false
        }).catch((err) => {
            notifyUser("Conversion failed!")
            isConversionStarted = false
        });
    }
    else if (exportType === "json") {
        sqliteConverter.convertToJson().then((result) => {
            notifyConversionIsDone()
            isConversionStarted = false
        }).catch((err) => {
            notifyUser("Conversion failed!")
            isConversionStarted = false
        });
    }
}

function notifyUser(messageBody) {
    const notifier = require('node-notifier')
    notifier.notify({
        title: 'Sensor Logger',
        message: messageBody
      });
}

function notifyConversionIsDone() {
    const notifier = require('node-notifier')
    notifier.notify({
        title: 'Sensor Logger',
        message: 'Conversion is done!',
        wait: true
      });

    notifier.on('click', function(notifierObject, options, event) {
        require('child_process').exec('start "" ' + EXPORT_DIRECTORY_NAME);
    });
}

var totalNumOfFiles = 100
var numOfTransfeeredFiles = 0

ipc.on('get-database-upload-status-percentage', function(event) {
    event.sender.send('database-upload-status-percentage', calculateDatabaseTransferProgress())
})

function calculateDatabaseTransferProgress() {
    return Math.floor((numOfTransfeeredFiles/totalNumOfFiles) * 100);
}

ipc.on('get-database-path', (event, arg) => {
    event.returnValue = loadedDBPath
})

ipc.on('database-file-path', (event, arg) => {
    loadedDBPath = arg;
    db = require('better-sqlite3')(loadedDBPath);
    device_id = []
    node_ids = db.prepare('SELECT node_id FROM device_data GROUP BY node_id').all()
    for (i = 0; i < node_ids.length; i++) {
        device_id.push(node_ids[i].node_id)
    }
    db.close()
    addDeviceSubMenu(device_id)
})

ipc.on('restoring-done', (event, arg) => {
    numOfTransfeeredFiles++

    if (numOfTransfeeredFiles === totalNumOfFiles) {
        closeServer();
        dataRestore.finish();
        workerWindow.webContents.send('finishWorker');
    }
})

ipc.on('load-database-from-folder', (event, arg) => {
    numOfTransfeeredFiles = 0
    const files = arg
    totalNumOfFiles = files.length

    event.sender.send('database-transfer-started');
    workerWindow.webContents.send('initWorker');
    dataRestore.init(true)

    for(var i = 0; i < totalNumOfFiles; i++) {
        const _filePath = files[i]
        var _fileType = 0;
        if(_filePath.indexOf("json") > -1) {
            _fileType = 0
        }
        else if(_filePath.indexOf("mobile") > -1) {
            _fileType = 1
        }
        else if(_filePath.indexOf("device") > -1) {
            _fileType = 2
        }

        //if(i % 2 === 1) {
        if(_fileType === 2) {
            workerWindow.webContents.send('restore', [_filePath, _fileType]);
            continue;
        }
        const fileType = _fileType
        const filePath = _filePath

        setTimeout(function () {
            dataRestore.restore(filePath, fileType).then(() => {
            numOfTransfeeredFiles++

            if (numOfTransfeeredFiles === totalNumOfFiles) {
                dataRestore.finish();
                workerWindow.webContents.send('finishWorker');
            }
        })
        }, i * 50)
    }
    
})

var packetsId = -1
ipc.on('publish-transfer-service', function(event) {
    console.log('publish-transfer-service')

    portfinder.getPort({port: 0, stopPort: 65535}, function (err, freePort) {
        fileTransferServer = http.createServer(function (req, res) {
           // if (req.url == '/upload' && req.method.toLowerCase() == 'post') {
                // parse a file upload
                var form = new formidable.IncomingForm();
                form.uploadDir = UPLOAD_DIRECTORY
                
                form.parse(req, function(err, fields, files) {
                    //console.log(req)
                    console.log("")
                    
                    if (err) {
                        console.log('some error', err)
                        closeServer()
                        mainWindow.webContents.send('database-transfer-error');
                    } 
                    else if (!(Object.entries(fields).length === 0 && fields.constructor === Object)) {
                        totalNumOfFiles = fields['numOfFiles']
                        packetsId = fields['id']
                        console.log(totalNumOfFiles)
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'text/plain');
                        res.end('Hello World\n');
                        mainWindow.webContents.send('database-transfer-started');
                        numOfTransfeeredFiles = 0
                        dataRestore.init(true)
                        workerWindow.webContents.send('initWorker');
                    } else if (!files.file) {
                        console.log('no file received')
                    } else {
                        var messageId = url.parse(req.url, true).query.id
                        if (messageId !== packetsId)
                            return;

                        var queryData = url.parse(req.url, true).query;
                        const fileType = Number(queryData.fileType);
///////////////////////////////////////////////////////////
                        if(fileType === 2) {
                            res.statusCode = 200;
                            res.setHeader('Content-Type', 'text/plain');
                            res.end('Hello World\n');
                            workerWindow.webContents.send('restore', [files.file.path, fileType]);
                            return;
                        }
//////////////////////////////////////////////////////////
                        dataRestore.restore(files.file.path, fileType).then(() => {
                            numOfTransfeeredFiles++

                            if (numOfTransfeeredFiles === totalNumOfFiles) {
                                closeServer();
                                dataRestore.finish()
                            }
                        })

                        var file = files.file
                        console.log('saved file to', file.path)
                        console.log('original name', file.name)
                        console.log('type', file.type)
                        console.log('size', file.size)
                         
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'text/plain');
                        res.end('Hello World\n');
                    }
                });
                
                return;
            //}
          }).listen(freePort);

          fileTransferServer.on('connection', function (socket) {
            // Add a newly connected socket
            var socketId = nextSocketId++;
            sockets[socketId] = socket;
            console.log('socket', socketId, 'opened');
          
            // Remove the socket when it closes
            socket.on('close', function () {
              delete sockets[socketId];
            });
          });

        txtRecord = {'ip' : getLocalWifiIpAddress()}
        
        const hostname = require("os").hostname()  + ".local."
        const name = "SensorLoggerFileTransfer"
        bonjour.publish({ name: name, type: 'hap', port: freePort, host: hostname, txt: txtRecord })
    });
    
})

function closeServer() {
    bonjour.unpublishAll();
    if (typeof fileTransferServer !== "undefined") {
        fileTransferServer.close(function () { 
            console.log('Server closed!'); });
            // Destroy all open sockets
            for (var socketId in sockets) {
                console.log('socket', socketId, 'destroyed');
                sockets[socketId].destroy();
            }
    }
}


function getLocalWifiIpAddress() {
    var os = require('os');
    var ifaces = os.networkInterfaces();
    var address;

    var wifiInterfaceName = "Wi-Fi"
    if (os.platform() === 'darwin') {
        wifiInterfaceName = "en0"
    }
    else if (os.platform() === 'linux') {
        wifiInterfaceName = "eth"
    }

    Object.keys(ifaces).forEach(function (ifname) {
        if (!(ifname === wifiInterfaceName))
            return;

        ifaces[ifname].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal !== false) {
                return;
            }

            address = iface.address
        });
    });

    return address;
}

bonjour.find({ type: 'hap' }, function (service) {
    console.log(service)
    //console.log(service.referer.address)
}) 