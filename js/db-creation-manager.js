class DBCreationManager {
    static UPLOADED_DB_PATH = "./data/data.sqlite"

    constructor() {
        this.db = require('better-sqlite3')(DBCreationManager.UPLOADED_DB_PATH)
        this.createTables()
    }

    createTables() {
        var sqlInit = `
            DROP TABLE IF EXISTS mobile_data;
            DROP TABLE IF EXISTS device_data;
            DROP TABLE IF EXISTS daily_activities;

            CREATE TABLE mobile_data (
                timestamp NUMERIC,
                gps_latitude REAL,
                gps_longitude REAL,
                gps_accuracy REAL,
                gps_altitude REAL,
                heart_rate REAL,
                step_count NUMERIC
            );

            CREATE TABLE device_data (
                mac_address TEXT,
                acc_x REAL,
                acc_y REAL,
                acc_z REAL,
                gyr_x REAL,
                gyr_y REAL,
                gyr_Z REAL
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

    insertMobileSensorData(mobileSensorDataBuffer) {
        const insert = this.db.prepare('INSERT INTO mobile_data (timestamp, ' 
                                                                + 'gps_latitude, gps_longitude, gps_accuracy, '
                                                                + 'gps_altitude, heart_rate, step_count'
                                                                + ') VALUES ('
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?'
                                                                + ')')
        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['timestamp'], sensorData['gps_latitude'],sensorData['gps_longitude'],sensorData['gps_accuracy'],
                            sensorData['gps_altitude'],sensorData['heart_rate'],sensorData['step_count'])
            }
        });

        insertMany(mobileSensorDataBuffer)
    }

    insertDeviceSensorData(deviceSensorDataBuffer) {
        const insert = this.db.prepare('INSERT INTO device_data (mac_address, ' 
                                                                + 'acc_x, acc_y, acc_z, '
                                                                + 'gyr_x, gyr_y, gyr_z'
                                                                + ') VALUES ('
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?'
                                                                + ')')

        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['mac_address'], sensorData['acc_x'],sensorData['acc_y'],sensorData['acc_z'],
                            sensorData['gyr_x'],sensorData['gyr_y'],sensorData['gyr_z'])
            }
        });

        insertMany(deviceSensorDataBuffer)
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
}
    
module.exports = DBCreationManager;