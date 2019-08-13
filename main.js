const electron = require('electron');
const url = require('url');
const path = require('path');
const ipc = electron.ipcMain
const SqliteToJson = require('sqlite-to-json')
const sqlite3 = require('sqlite3')
const fileSystem = require('fs')

var options = {
    multicast: true, // use udp multicasting
}
var bonjour = require('bonjour-hap')();
//const bonjour = require('bonjour')()
const portfinder = require('portfinder')
const http = require('http');
const formidable = require('formidable')

const {app, BrowserWindow, Menu} = electron;

const TMP_DIRECTORY = "./tmp"
const DB_NAME = "db"
const DB_EXTENSION = ".sqlite"
const DB_PATH = TMP_DIRECTORY + '/' + DB_NAME + DB_EXTENSION

let mainWindow;

emptyTmpDirectory();

// Listen for app to be ready
app.on('ready', function() {
    // Create new window
    mainWindow = new BrowserWindow({
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
    //const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    // Insert menu
    //Menu.setApplicationMenu(mainMenu);
});

// Handle create add window
function createAddWindow() {

}

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

// Create menu template
const mainMenuTemplate = [
    {
        label:'File', 
        submenu:[
            {
                label: 'Add Item',
                click() {
                    createAddWindow();
                }
            },
            {
                label: 'Clear Items'
            },
            {
                label: 'Quit',
                accelerator: process.platfrom == 'darwin' ? 'Command+Q' : 'Ctrl+Q',
                click() {
                    //ipc.send
                    //app.quit();
                }
            }
        ]
    }
];


function exportDatabaseToJson() {
    const exporter = new SqliteToJson({
        client: new sqlite3.Database(DB_PATH)
    });

    exporter.all(function (err, all) {
        fileSystem.writeFile(TMP_DIRECTORY + '/' + DB_NAME + ".json", JSON.stringify(all), 'utf8', function (err) {
            //console.log("Can not write json object. Error occurred: " + err);
        })
    });
}

function exportDatabaseToCSV() {
    const ToCsv  =  require("./sqlite-to-csv");
    let filePath  =  DB_PATH;
    let outputPath  =  TMP_DIRECTORY;
    let logPath  =  TMP_DIRECTORY;
    let sqliteToCsv  =  new ToCsv()
                .setFilePath(filePath)
                .setOutputPath(outputPath)
                .setLogPath(logPath);
    sqliteToCsv.convert().then( (result) => {
        //Converted successfully
    }).catch((err) => {
        //Failed to convert
    });
}

ipc.on('start-database-conversions', function(event) {
    console.log("start-database-conversions");
    exportDatabaseToJson();
    exportDatabaseToCSV();     
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
                    } else if (!files.file) {
                        console.log('no file received')
                    } else {
                        var file = files.file
                        console.log('saved file to', file.path)
                        console.log('original name', file.name)
                        console.log('type', file.type)
                        console.log('size', file.size)
                    
                    }
                });

                /*form.parse(req, function(err, fields, files) {
                    res.writeHead(200, {'content-type': 'text/plain'});
                    res.write('received upload:\n\n');
                    res.end(util.inspect({fields: fields, files: files}));
                });*/
                
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


const hostname = '127.0.0.1';
const port = 3000;
const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World\n');
  });
  
  server.listen(port, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });


function function2() {
    bonjour.unpublishAll();
}


// call the rest of the code and have it execute after 3 seconds
//setTimeout(function2, 10000);