class ToCsv {
    constructor(filePath, outputPath, logPath) {
        this.filePath = filePath;
        this.outputPath = outputPath;
        this.logPath = logPath;
        this.db = undefined;
    }

    setFilePath(filePath) {
        this.filePath = filePath;
        return this;
    }

    setOutputPath(outputPath) {
        this.outputPath = outputPath;
        return this;
    }

    setLogPath(logPath) {
        this.logPath = logPath + "/sqliteToCsv.log";
        return this;
    }

    convert() {

        return new Promise( async (resolve, reject) => {
            try {
                let filePath = this.filePath;
                let outputPath = this.outputPath;

                if(!filePath) {
                    throw "ERR102 :: filePath params missing in first argument of toCSV()";
                }

                if(!outputPath) {
                    throw "ERR103 :: outputPath params missing in first argument of toCSV()";
                }

                const fs = require("fs");

                if(!fs.existsSync(filePath)) {
                    throw "ERR100 :: " + filePath + "not found";
                }

                if(!fs.existsSync(outputPath)) {
                    this.writeLog("WRN200 :: Output path director not found. Default folder named \"csv\" is created in current working directory");
                    fs.mkdirSync("csv");
                    this.outputPath = "csv";
                    outputPath = this.outputPath;
                }
    
                const sqlite3 = require("sqlite3");

                let db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
                    if(err) {
                        throw "ERR101 : Failed to open given database with read only mode \n" + err;
                    }
                });

                this.db = db;

                db.serialize( () => {

                    db.all("select * from sqlite_master where type='table'", [], async (err, rows) => {
                        if(err) {
                            throw "ERR103 :: Failed to execute query :: select name from sqlite_master where type='table'";
                        }

                        for(let i = 0; i<rows.length; i++) {
                            let tableData = await this.readTable(rows[i].name);
                            await this.writeTableToCsv(tableData, rows[i].name + ".csv", outputPath);
                        }

                        resolve({
                            code : 200,
                            message : "success"
                        });
                    });
    
                });
            }
            catch(err) {
                this.writeLog(err);
                reject(err);
            }
        });
    }

    readTable(tableName) {
        return new Promise( (resolve, reject) => { 
            let db = this.db;
            let outputPath = this.outputPath
            db.all("select * from " + tableName, [], async (err, rows) => {
                if(err) {
                    reject("Failed to execute query :: select * from " + tableName);
                }
                else {
                    resolve(rows);
                }
            });
        })
    }

    writeTableToCsv(rows, filePath, outputPath) {

        return new Promise( async (resolve, reject) => {
            try {
                let columnNames = "\"" + Object.keys(rows.length ? rows[0] : []).join("\",\"") + "\"";
                let csvData = columnNames + "\n";
    
                rows.map( (row) => {
                    csvData = csvData + "\"" + Object.values(row).join("\",\"") + "\"" + "\n";
                });
                
                let fs = require('fs');

                fs.writeFile(outputPath + "/" + filePath, csvData, "utf-8", (err) => {
                    if(err) {
                        reject("ERR104 :: Failed to write to " + outputPath + "/" + filePath);
                    }
                    else {
                        resolve({
                            code : 200,
                            message : "Write operation success"
                        })
                    }
                });
            }
            catch(err) {
                throw err;
            }
        });
    
    }

    writeLog(message) {
        try {
            let logPath = this.logPath;
            if(!logPath) {
                console.log(message);
                return;
            }
            let fs = require("fs");
            fs.appendFileSync(logPath, message);
        }
        catch(err) {
            console.log("Exception in writeLog() :: " + this.parseObj(err));
        }
    }

    parseObj(obj) {
        if(typeof obj === "object") {
            return JSON.stringify(obj);
        }
        return obj;
    }
}

module.exports = ToCsv;

/* --- Error Handling --- */
/*
ERR100 -> Input database file not found
ERR101 -> Failed to open given database with read only mode
ERR102 -> filePath params missing in first argument of toCSV()
ERR103 -> outputPath params missing in first argument of toCSV()
ERR104 -> Failed to write to csv file
*/

/* --- Warning --- */
/*
WRN200 -> Output path director not found. Default folder named "csv" is created in current working directory. 
*/