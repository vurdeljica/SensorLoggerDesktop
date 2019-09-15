
/**
 * Class is used only when database is uploading from phone, or when 
 * it is loaded from binary files from directory. 
 */
class DBCreationManager {
    static UPLOADED_DB_PATH = "./data/data.sqlite"

    /**
     * Class constructor.
     * 
     * @param {*} shouldCreate flag which decides whether database tables
     * will be cleared
     */
    constructor(shouldCreate) {
        this.db = require('better-sqlite3')(DBCreationManager.UPLOADED_DB_PATH)

        if (shouldCreate)
            this.createTables()

        return this;
    }


    /**
     * Create tables.
     */
    createTables() {
        var sqlInit = `
            DROP TABLE IF EXISTS location_data;
            DROP TABLE IF EXISTS sensor_data;
            DROP TABLE IF EXISTS daily_activities;

            CREATE TABLE location_data (
                timestamp NUMERIC,
                gps_latitude REAL,
                gps_longitude REAL,
                gps_altitude REAL
            );

            CREATE TABLE sensor_data (
                node_id TEXT,
                timestamp NUMERIC,
                heart_rate NUMERIC,
                step_count NUMERIC,
                acc_x REAL,
                acc_y REAL,
                acc_z REAL,
                gyr_x REAL,
                gyr_y REAL,
                gyr_Z REAL,
                mag_x REAL,
                mag_y REAL,
                mag_z REAL
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

    /**
     * Add array of object to database in location_data table
     * 
     * @param {Object[]} mobileSensorDataBuffer Array of mobile sensor objects
     */
    insertLocationData(mobileSensorDataBuffer) {
        const insert = this.db.prepare('INSERT INTO location_data (timestamp, gps_latitude, gps_longitude, gps_altitude)'
                                                                    + ' VALUES (?, ?, ?, ?)')
        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['timestamp'], sensorData['gps_latitude'], sensorData['gps_longitude'], sensorData['gps_altitude'])
            }
        });

        insertMany(mobileSensorDataBuffer)
    }

    /**
     * Add array of object to database in sensor_data table
     * 
     * @param {Object[]} deviceSensorDataBuffer  Array of device sensor objects
     */
    insertDeviceData(deviceSensorDataBuffer) {
        const insert = this.db.prepare('INSERT INTO sensor_data (node_id, timestamp, ' 
                                                                + 'acc_x, acc_y, acc_z, '
                                                                + 'gyr_x, gyr_y, gyr_z, '
                                                                + 'heart_rate, step_count, '
                                                                + 'mag_x, mag_y, mag_z'
                                                                + ') VALUES ('
                                                                    + '?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?, ?, '
                                                                    + '?, ?'
                                                                + ')')

        const insertMany = this.db.transaction((data) => {
            for (const sensorData of data) {
                insert.run(sensorData['nodeId'], sensorData['timestamp'],
                            sensorData['acc_x'], sensorData['acc_y'], sensorData['acc_z'],
                            sensorData['gyr_x'], sensorData['gyr_y'], sensorData['gyr_z'], 
                            sensorData['heart_rate'], sensorData['step_count'], 
                            sensorData['mag_x'], sensorData['mag_y'], sensorData['mag_z'])
            }
        });

        insertMany(deviceSensorDataBuffer)
    }

    /**
     * Add array of jsson objects to database in daily_activity table
     * 
     * @param {Object[]} jsonArray Array of json objects
     */
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

    /**
     * Close connection with database
     */
    close() {
        this.db.close()
    }
}

module.exports = DBCreationManager;