class DBCreationManager {
    static UPLOADED_DB_PATH = "./data/data.sqlite"

    constructor() {
        this.db = require('better-sqlite3')(DBCreationManager.UPLOADED_DB_PATH)
        this.createTables()
    }

    createTables() {
        const sqlInit = `
            DROP TABLE IF EXISTS sensor_data;
            DROP TABLE IF EXISTS daily_activities;

            CREATE TABLE sensor_data (
                timestamp NUMERIC,
                gps_latitude REAL,
                gps_longitude REAL,
                gps_accuracy REAL,
                gps_altitude REAL,
                heart_rate REAL,
                step_count NUMERIC,
                acc1_x REAL,
                acc1_y REAL,
                acc1_z REAL,
                gyr1_x REAL,
                gyr1_y REAL,
                gyr1_z REAL,
                acc2_x REAL,
                acc2_y REAL,
                acc2_z REAL,
                gyr2_x REAL,
                gyr2_y REAL,
                gyr2_z REAL
            );

            CREATE TABLE daily_activities (
                activity_title TEXT,
                activity_type TEXT,
                date TEXT,
                startTime TEXT,
                endTime TEXT,
                notes TEXT
            );
        `;
        this.db.exec(sqlInit)
    }

    insertSensorData(sensorDataBuffer) {
        const insert = this.db.prepare('INSERT INTO sensor_data (timestamp, gps_latitude, gps_longitude, gps_accuracy, '
                                                                + 'gps_altitude, heart_rate, step_count, '
                                                                + 'acc1_x, acc1_y, acc1_z, '
                                                                + 'gyr1_x, gyr1_y, gyr1_z, ' 
                                                                + 'acc2_x, acc2_y, acc2_z, '
                                                                + 'gyr2_x, gyr2_y, gyr2_z ' 
                                                                + ') VALUES ('
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?'
                                                                + ')')

        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['timestamp'], sensorData['gps_latitude'],sensorData['gps_longitude'],sensorData['gps_accuracy'],
                            sensorData['gps_altitude'],sensorData['heart_rate'],sensorData['step_count'],
                            sensorData['acc1_x'],sensorData['acc1_y'],sensorData['acc1_z'],
                            sensorData['gyr1_x'],sensorData['gyr1_y'],sensorData['gyr1_z'],
                            sensorData['acc2_x'],sensorData['acc2_y'],sensorData['acc2_z'],
                            sensorData['gyr2_x'],sensorData['gyr2_y'],sensorData['gyr2_z'],
                            )
            }
        });

        insertMany(sensorDataBuffer)
    }

    insertJSONarray(jsonArray) {
        const insert = this.db.prepare('INSERT INTO daily_activities (activity_title, activity_type, date, '
                                                                    + 'startTime, endTime, notes)'
                                                                    + 'VALUES ('
                                                                        + '?, ?, ?, '
                                                                        + '?, ?, ?'
                                                                    + ')')

        const insertMany = this.db.transaction((data) => {
            data['activities'].forEach(function(dailyActivity) { 
                insert.run(dailyActivity.activityTitle, dailyActivity.activityType,dailyActivity.date,
                           dailyActivity.startTime,dailyActivity.endTime,dailyActivity.notes) 
              });
        });

        insertMany(jsonArray)
    }

    copyColumnsFromDatabase(databasePath) {
        console.log("ATTACH '" + databasePath + "' AS temp;")
        const copyStatement = this.db.prepare("ATTACH DATABASE '" + databasePath + "' AS temp;")
      //const copyStatement = this.db.prepare("ATTACH '" + databasePath + "' AS temp;")
        this.db.exec(copyStatement)

        //const insertStatement = this.db.prepare('INSERT INTO album SELECT * FROM temp.Album;')
        //this.db.exec(insertStatement)
    }

}
    
module.exports = DBCreationManager;