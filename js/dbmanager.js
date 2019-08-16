class DBManager {
    static SQL_FROM_REGEX = /FROM\s+([^\s;]+)/mi;
    static SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
    static SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;


    //can be filePath or DBManager, node.js supports only one constructor
    constructor(filePath) {
        this.db = require('better-sqlite3')(filePath)
        this.rowCounts = new Object()
        this.queryTablesTypeInfo()
    }

    queryTablesTypeInfo() {
        var tables = this.db.prepare("SELECT * FROM sqlite_master WHERE type='table' ORDER BY name")

        for (const rowObj of tables.iterate()) {
            var name = rowObj.name;

            var rowCount = this.queryTableRowCount(name);
            this.rowCounts[name] = rowCount;
        }
    }

    queryTableRowCount(name) {
        var stmt = this.db.prepare("SELECT COUNT(*) AS count FROM '" + name + "'");
        return stmt.get().count
    }


    queryTableColumnTypes(tableName) {
        var result = new Object();
        var stmt = this.db.prepare("PRAGMA table_info('" + tableName + "')");

        for (const columnTypeInfo of stmt.iterate()) {
            result[columnTypeInfo.name] = columnTypeInfo.type
        }

        return result
    }

    getTableNameFromQuery(query) {
        var sqlRegex = SQL_FROM_REGEX.exec(query);
        if (sqlRegex != null) {
            return sqlRegex[1].replace(/"|'/gi, "");
        } else {
            return null;
        }
    }



   executeQuery(query) {
        var stmt = this.db.prepare(query);
        return stmt
   }

    makeDefaultQuery(tableName) {
        return "SELECT * FROM '" + tableName + "' LIMIT 0,30";
    }

    getTableRowCounts() {
        return this.rowCounts
    }

    getTableRowCount(tableName) {
        return this.rowCounts[tableName]
    }


}