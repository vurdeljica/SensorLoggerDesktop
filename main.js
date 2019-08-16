const electron = require('electron');
const url = require('url');
const path = require('path');
const ipc = electron.ipcMain
const fileSystem = require('fs')
var bonjour = require('bonjour-hap')();
const portfinder = require('portfinder')
const http = require('http');
const formidable = require('formidable')

const {app, BrowserWindow, Menu, dialog} = electron;

const TMP_DIRECTORY = "./tmp"
const DB_NAME = "db"
const DB_EXTENSION = ".sqlite"
const DB_PATH = TMP_DIRECTORY + '/' + DB_NAME + DB_EXTENSION

let mainWindow;
let loadedDBPath = ""

//emptyTmpDirectory();

function emptyTmpDirectory() {
    const directory = 'tmp';

    fileSystem.readdir(directory, (err, files) => {
    if (err) throw err;

    for (const file of files) {
        fileSystem.unlink(path.join(directory, file), err => {
        if (err) throw err;
        });
    }
    });
}

// Listen for app to be ready
app.on('ready', function() {
    emptyTmpDirectory()

    // Create new window
    mainWindow = new BrowserWindow({
        minHeight: 700,
        minWidth: 1100,
        webPreferences: {
            nodeIntegration: true
        }
    });

    //mainWindow.on('close', emptyTmpDirectory)

    // Load html into window
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol:'file:',
        slashes: true
    }));

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
                    mainWindow.webContents.send('show-home-page');
                }
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
                role: 'reload'
            },
            {
                role: 'close'
            }
        ]
    }
];

function copyFile(source, destination) {
    fileSystem.copyFile(source, destination, (err) => {
        if (err) {
            notifyUser("Save as failed! Please try again.")
        }
      });
}

ipc.on('start-database-conversions', function(event) {
    console.log("start-database-conversions");
    exportDatabase("csv");
    //exportDatabase("json");     
})

var isConversionStarted = false

function exportDatabase(exportType) {
    if (isConversionStarted) {
        notifyUser("Can not start new conversion. Conversion is already in progress!")
        return
    } 

    notifyUser("Conversion is started!")

    isConversionStarted = true

    const SqliteConverter  =  require("./sqlite-converter");
    let filePath  =  DB_PATH;
    let outputPath  =  TMP_DIRECTORY;
    let logPath  =  TMP_DIRECTORY;
    let sqliteConverter  =  new SqliteConverter()
                .setFilePath(filePath)
                .setOutputPath(outputPath)
                .setLogPath(logPath);

    if (exportType === "csv") {
        sqliteConverter.convertToCSV().then( (result) => {
            notifyConversionIsDone()
            isConversionStarted = false
        }).catch((err) => {
            notifyUser("Conversion failed!")
            isConversionStarted = false
        });
    }
    else if (exportType === "json") {
        sqliteConverter.convertToJson().then( (result) => {
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
        require('child_process').exec('start "" "tmp"');
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

ipc.on('database-file-path', (event, arg) => {
    loadedDBPath = arg;
})

ipc.on('publish-transfer-service', function(event) {
    console.log('publish-transfer-service')

    portfinder.getPort({port: 0, stopPort: 65535}, function (err, freePort) {
        http.createServer(function (req, res) {
           // if (req.url == '/upload' && req.method.toLowerCase() == 'post') {
                // parse a file upload
                var form = new formidable.IncomingForm();
                
                form.parse(req, function(err, fields, files) {
                    
                    if (err) {
                        console.log('some error', err)
                    } 
                    else if (!(Object.entries(fields).length === 0 && fields.constructor === Object)) {
                        totalNumOfFiles = fields['numOfFiles']
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'text/plain');
                        res.end('Hello World\n');
                    } else if (!files.file) {
                        console.log('no file received')
                    } else {
                        var file = files.file
                        numOfTransfeeredFiles++
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

        txtRecord = {'ip' : getLocalWifiIpAddress()}
        
        bonjour.publish({ name: "SensorLoggerFileTransfer2", type: 'hap', port: freePort, host: "test.local.", txt: txtRecord })
    });
    
})

function getLocalWifiIpAddress() {
    var os = require('os');
    var ifaces = os.networkInterfaces();
    var address;

    Object.keys(ifaces).forEach(function (ifname) {
        if (!(ifname == "Wi-Fi"))
            return;

        ifaces[ifname].forEach(function (iface) {
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
    console.log('Found an HTTP server:', service)
    //console.log(service.referer.address)
})

//function function2() {
//    bonjour.unpublishAll();
//}


// call the rest of the code and have it execute after 3 seconds
//setTimeout(function2, 10000);