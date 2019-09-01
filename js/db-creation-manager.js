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
                gps_altitude REAL
            );

            CREATE TABLE device_data (
                node_id TEXT,
                timestamp NUMERIC,
                heart_rate NUMERIC,
                step_count NUMERIC,
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
        const insert = this.db.prepare('INSERT INTO mobile_data (timestamp, gps_latitude, gps_longitude, gps_altitude)'
                                                                    + ' VALUES (?, ?, ?, ?)')
        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['timestamp'], sensorData['gps_latitude'], sensorData['gps_longitude'], sensorData['gps_altitude'])
            }
        });

        insertMany(mobileSensorDataBuffer)
    }

    insertDeviceSensorData(deviceSensorDataBuffer) {
        const insert = this.db.prepare('INSERT INTO device_data (node_id, timestamp, ' 
                                                                + 'acc_x, acc_y, acc_z, '
                                                                + 'gyr_x, gyr_y, gyr_z, '
                                                                + 'heart_rate, step_count'
                                                                + ') VALUES ('
                                                                    + '?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?'
                                                                + ')')

        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['node_id'], sensorData['timestamp'],
                            sensorData['acc_x'], sensorData['acc_y'], sensorData['acc_z'],
                            sensorData['gyr_x'], sensorData['gyr_y'], sensorData['gyr_z'], 
                            sensorData['heart_rate'], sensorData['step_count'])
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

    close() {
        this.db.close()
    }
}
    
module.exports = DBCreationManager;