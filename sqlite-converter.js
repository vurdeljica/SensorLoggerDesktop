class SqliteConverter {
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
        this.logPath = logPath + "/sqliteConvert.log";
        return this;
    }

    convertToJson() {
        return this.convert("json")
    }

    convertToCSV() {
        return this.convert("csv")
    }

    convert(conversionType) {

        return new Promise( async (resolve, reject) => {
            try {
                let filePath = this.filePath;
                let outputPath = this.outputPath;

                if(!filePath) {
                    throw "ERR102 :: filePath params missing in first argument of SqliteConverter()";
                }

                if(!outputPath) {
                    throw "ERR103 :: outputPath params missing in first argument of SqliteConverter()";
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
                            var offset = 0;
                            var numOfRows = 100000;
                            var index = 0
                            var numOfJobs = Math.ceil((await this.numberOfRowsFromTable(rows[i].name))[0].cnt / numOfRows)
                            console.log(numOfJobs)
                            while (index < numOfJobs) {
                                const tmp_index = index;
                                this.readRowsFromTable(rows[i].name, offset, numOfRows).then(tableData => {
                                    if(Object.entries(tableData).length === 0) {
                                        return; // no more data to be read
                                    }
    
                                    if (conversionType === "csv") {
                                        this.writeTableToCsv(tableData, rows[i].name + tmp_index + ".csv", outputPath, (offset === 0));
                                    }
                                    else if (conversionType == "json") {
                                        this.writeTableToJson(tableData, rows[i].name + tmp_index + ".json", outputPath);
                                    }
                                })

                                index++
                                offset += numOfRows
                            }
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

    readRowsFromTable(tableName, offset, numOfRows) {
        return new Promise( (resolve, reject) => { 
            let db = this.db;
            let outputPath = this.outputPath
            db.all("select * from " + tableName + " limit " + offset + "," + numOfRows, async (err, rows) => {
                if(err) {
                    reject("Failed to execute query :: select * from " + tableName);
                }
                else {
                    resolve(rows);
                }
            });
        })
    }

    numberOfRowsFromTable(tableName) {
        return new Promise( (resolve, reject) => { 
            let db = this.db;
            db.all("select count(*) as cnt from " + tableName, async (err, numOfRows) => {
                if(err) {
                    reject("Failed to execute query :: select * from " + tableName);
                }
                else {
                    resolve(numOfRows);
                }
            });
        })
    }

    writeTableToCsv(rows, filePath, outputPath, shouldPrintHeader) {
        return new Promise( async (resolve, reject) => {
            try {
                let columnNames = ""
                let csvData = ""

                columnNames = "\"" + Object.keys(rows.length ? rows[0] : []).join("\",\"") + "\"";
                csvData = columnNames + "\n";
                rows.map( (row) => {
                    csvData = csvData + "\"" + Object.values(row).join("\",\"") + "\"" + "\n";
                });
            
                let fs = require('fs')
                fs.writeFile(outputPath + "/" + filePath, csvData, (err) => {
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

    writeTableToJson(rows, filePath, outputPath) {
        return new Promise( async (resolve, reject) => {
            try {
                let fs = require('fs');

                fs.appendFile(outputPath + "/" + filePath, JSON.stringify(rows), (err) => {
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

module.exports = SqliteConverter;

/* --- Error Handling --- */
/*
ERR100 -> Input database file not found
ERR101 -> Failed to open given database with read only mode
ERR102 -> filePath params missing in first argument of SqliteConverter()
ERR103 -> outputPath params missing in first argument of SqliteConverter()
ERR104 -> Failed to write to csv file
*/

/* --- Warning --- */
/*
WRN200 -> Output path director not found. Default folder named "csv" is created in current working directory. 
*/