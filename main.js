const electron = require('electron');
const url = require('url');
const path = require('path');
const ipc = electron.ipcMain
const SqliteToJson = require('sqlite-to-json')
const sqlite3 = require('sqlite3')
const fileSystem = require("fs")

const {app, BrowserWindow, Menu} = electron;

let mainWindow;

// Listen for app to be ready
app.on('ready', function() {
    // Create new window
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
          }
    });
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

ipc.on('start-database-conversions', function(event) {
    console.log("IPC is called");
    const exporter = new SqliteToJson({
        client: new sqlite3.Database('./tmp/db.sqlite')
    });

    exporter.all(function (err, all) {
        fileSystem.writeFile("./tmp/output.json", JSON.stringify(all), 'utf8', function (err) {
            //console.log("Can not write json object. Error occurred: " + err);
        })
      });
    
})