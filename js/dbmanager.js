class DBManager {
    static SQL_FROM_REGEX = /FROM\s+([^\s;]+)/mi;
    static SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
    static SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;


    /**
     * Path to the database that will be created if it doesn't exist
     * 
     * @param {String} filePath Path to the database 
     */
    constructor(filePath) {
        this.db = require('better-sqlite3')(filePath)
        this.rowCounts = new Object()
        this.queryTablesTypeInfo()
    }

    /**
     * Get number of rows of each table in database
     */
    queryTablesTypeInfo() {
        var tables = this.db.prepare("SELECT * FROM sqlite_master WHERE type='table' ORDER BY name")

        for (const rowObj of tables.iterate()) {
            var name = rowObj.name;

            var rowCount = this.queryTableRowCount(name);
            this.rowCounts[name] = rowCount;
        }
    }

    /**
     * Get row count of table
     * 
     * @param {String} name table name
     * @return {Number} number of rows that table has 
     */
    queryTableRowCount(name) {
        var stmt = this.db.prepare("SELECT COUNT(*) AS count FROM '" + name + "'");
        return stmt.get().count
    }

    /**
     * Get type of all tables in database
     * 
     * @param {String} tableName 
     */
    queryTableColumnTypes(tableName) {
        var result = new Object();
        var stmt = this.db.prepare("PRAGMA table_info('" + tableName + "')");

        for (const columnTypeInfo of stmt.iterate()) {
            result[columnTypeInfo.name] = columnTypeInfo.type
        }

        return result
    }

    /**
     * Parse query to find name of the table on which query is performed
     * 
     * @param {String} query SQL query 
     */
    getTableNameFromQuery(query) {
        var sqlRegex = SQL_FROM_REGEX.exec(query);
        if (sqlRegex != null) {
            return sqlRegex[1].replace(/"|'/gi, "");
        } else {
            return null;
        }
    }


    /**
     * Execute query
     * 
     * @param {String} query query to be executes
     */
   executeQuery(query) {
        var stmt = this.db.prepare(query);
        return stmt
   }

   /**
    * Form default query for the table
    * 
    * @param {String} tableName name of the table
    * @return {String} return string that represents deafult query 
    */
    makeDefaultQuery(tableName) {
        return "SELECT * FROM '" + tableName + "' LIMIT 0,30";
    }

    /**
     * Returns object that has information about row count of each table
     */
    getTableRowCounts() {
        return this.rowCounts
    }

    /**
     * Return row count of specific table
     * 
     * @param {String} tableName 
     */
    getTableRowCount(tableName) {
        return this.rowCounts[tableName]
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close()
    }

}