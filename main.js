const electron = require('electron');
const url = require('url');
const path = require('path');
const ipc = electron.ipcMain
const fileSystem = require('fs')
var bonjour = require('bonjour-hap')();
const portfinder = require('portfinder')
const http = require('http');
const formidable = require('formidable')
const protobuf = require('protobufjs')
const zlib = require('zlib');

const {app, BrowserWindow, Menu, dialog} = electron;

const EXPORT_DIRECTORY_NAME = "export"
const EXPORT_DIRECTORY = "./" + EXPORT_DIRECTORY_NAME
const UPLOAD_DIRECTORY = "./upload"
const DATA_DIRECTORY = "./data"

let mainWindow = null;
let loadedDBPath = ""
var fileTransferServer = undefined, sockets = {}, nextSocketId = 0
var dbManager = null

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
        if (dbManager != null) {
            dbManager.close()
        }

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
                        mainWindow.webContents.send('database-transfer-error');
                    } 
                    else if (!(Object.entries(fields).length === 0 && fields.constructor === Object)) {
                        totalNumOfFiles = fields['numOfFiles']
                        console.log(totalNumOfFiles)
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'text/plain');
                        res.end('Hello World\n');
                        mainWindow.webContents.send('database-transfer-started');
                        numOfTransfeeredFiles = 0

                        const DBCreationManager = require('./js/db-creation-manager')
                        dbManager = new DBCreationManager()
                    } else if (!files.file) {
                        console.log('no file received')
                    } else {
                        console.log("Here " + files.file.type)
                        var queryData = url.parse(req.url, true).query;
                        const fileType = Number(queryData.fileType);
                        console.log(typeof fileType)

                        if (fileType === 0) {
                            const data =  fileSystem.readFileSync(files.file.path, "utf8");
                            var dailyActivitiesJSON = JSON.parse(data);
                            dbManager.insertJSONarray(dailyActivitiesJSON);
                            numOfTransfeeredFiles++
                        }
                        else {
                            try {
                                decompress(files.file.path, fileType).then(() => {
                                    numOfTransfeeredFiles++

                                    if (numOfTransfeeredFiles == totalNumOfFiles) {
                                        dbManager.close();
                                        closeServer();
                                    }
                                })
                            }
                            catch(err) {
                                console.log("Error occured while receiving data on file: " + files.file.path)
                            }
                        }
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

function decompress(filePath, fileType) {
    return new Promise( (resolve, reject) => { 
        const fileContents = fileSystem.createReadStream(filePath);
        const writeStream = fileSystem.createWriteStream(filePath + 'unzip');
        const unzip = zlib.createInflate();
    
        fileContents.pipe(unzip).pipe(writeStream).on('finish', (err) => {
            writeStream.close()
            if(err) {
                reject("Failed to decompress file: " + filePath);
            }
            else {
                deserialize(filePath, fileType)
                resolve({
                    code : 200,
                    message : "Decompression success"
                });
            }
        });
    })
}

function deserialize(filePath, fileType) {
    var fileContent = fileSystem.readFileSync(filePath + 'unzip');
    var reader = protobuf.Reader.create(fileContent);
    var sensorDataBuffer = []
    while(reader.pos < reader.len) {
        var sensorData;
        if (fileType === 1) {
            sensorData = require('./sensordata.js').MobileData.decodeDelimited(reader)
        }
        else if (fileType === 2) {
            sensorData = require('./sensordata.js').DeviceData.decodeDelimited(reader)
        }
        sensorData = fixInt64(sensorData)
        sensorDataBuffer.push(sensorData)
    }
    if (fileType === 1) {
        dbManager.insertMobileSensorData(sensorDataBuffer)
    }
    else if (fileType === 2) {
        dbManager.insertDeviceSensorData(sensorDataBuffer)
    }
}

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

var fixInt64 = function(obj) {
    for(var key in obj) {
        if(typeof obj[key] === 'object'){
            fixInt64(obj[key]);
        }
        if(obj[key] instanceof protobuf.util.Long){
            obj[key] = obj[key].toNumber();
        }
    }
    return obj;
}

function getLocalWifiIpAddress() {
    var address = require('address');

    var os = require('os');
    var ifaces = os.networkInterfaces();
    var address;

    console.log (os.platform())

    var wifiInterfaceName = "Wi-Fi"
    if (os.platform() === 'darwin') {
        wifiInterfaceName = "en0"
    }
    else if (os.platform() === 'linux') {
        wifiInterfaceName = "eth"
    }

    Object.keys(ifaces).forEach(function (ifname) {
        console.log(!(ifname === wifiInterfaceName), ifname, wifiInterfaceName)
        if (!(ifname === wifiInterfaceName))
            return;

        ifaces[ifname].forEach(function (iface) {
            console.log(('IPv4' !== iface.family || iface.internal !== false), iface.family, iface.internal)
            if ('IPv4' !== iface.family || iface.internal !== false) {
                // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
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

 

