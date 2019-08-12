const electron = require('electron');
const url = require('url');
const path = require('path');
const ipc = electron.ipcMain
const SqliteToJson = require('sqlite-to-json')
const sqlite3 = require('sqlite3')
const fileSystem = require("fs")

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
    console.log("IPC is called");
    exportDatabaseToJson();
    exportDatabaseToCSV();     
})