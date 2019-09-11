const electron = require("electron");
const { dialog } = require('electron').remote
const ipc = electron.ipcRenderer

var SQL_FROM_REGEX = /FROM\s+([^\s;]+)/mi;
var SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
var SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;
const UPLOADED_DB_PATH = "./data/data.sqlite"

var dbManager = null;
var editor = ace.edit("sql-editor");
var bottomBarDefaultPos = null, bottomBarDisplayStyle = null;
var errorBox = $("#error");
var lastCachedQueryCount = {};


ipc.on('show-home-page', function(event, arg) {
    setIsLoading(false);
    $("#drop-loading-message").html("Processing file ...")
    $(".nouploadinfo").show();
    $("#sample-db-link").show();
    $("#output-box").hide();
    $("#success-box").hide();
    $("#bottom-bar").hide();
    $("#dropzone").show();
    $("#dropzone").delay(50).animate({height: 497}, 500);
    
    databaseTransferInProgress = false
    databaseUploadProgressPercentage = 0;
    databaseErrorOccured = false
})

var fileReaderOpts = {
    readAsDefault: "ArrayBuffer", on: {
        beforestart: function (e, file) {
            loadDB(e.path)
            return false;
        }
    }
};

var windowResize = function () {
    positionFooter();
    var container = $("#main-container");
    var cleft = container.offset().left + container.outerWidth();
    $("#bottom-bar").css("left", cleft);
};

var positionFooter = function () {
    var footer = $("#bottom-bar");
    var pager = footer.find("#pager");
    var container = $("#main-container");
    var containerHeight = container.height();
    var footerTop = ($(window).scrollTop()+$(window).height());

    if (bottomBarDefaultPos === null) {
        bottomBarDefaultPos = footer.css("position");
    }

    if (bottomBarDisplayStyle === null) {
        bottomBarDisplayStyle = pager.css("display");
    }

    if (footerTop > containerHeight) {
        footer.css({
            position: "static"
        });
        pager.css("display", "inline-block");
    } else {
        footer.css({
            position: bottomBarDefaultPos
        });
        pager.css("display", bottomBarDisplayStyle);
    }
};

var toggleFullScreen = function () {
    var container = $("#main-container");
    var resizerIcon = $("#resizer i");

    container.toggleClass('container container-fluid');
    resizerIcon.toggleClass('glyphicon-resize-full glyphicon-resize-small');
}
$('#resizer').click(toggleFullScreen);

if (typeof FileReader === "undefined") {
    $('#dropzone, #dropzone-dialog').hide();
    $('#compat-error').show();
} else {
    //$('#dropzone, #dropzone-dialog').fileReaderJS(fileReaderOpts);
}

//Initialize editor
editor.setTheme("ace/theme/chrome");
editor.renderer.setShowGutter(false);
editor.renderer.setShowPrintMargin(false);
editor.renderer.setPadding(20);
editor.renderer.setScrollMargin(8, 8, 0, 0);
editor.setHighlightActiveLine(false);
editor.getSession().setUseWrapMode(true);
editor.getSession().setMode("ace/mode/sql");
editor.setOptions({ maxLines: 5 });

//Update pager position
$(window).resize(windowResize).scroll(positionFooter);
//windowResize();

$(".no-propagate").on("click", function (el) { el.stopPropagation(); });

function loadDB(filePath) {
    $("#drop-loading-message").html("Processing file ...")
    setIsLoading(true);

    resetTableList();

    ipc.send('database-file-path', filePath)

    setTimeout(function () {
        try {
            if (dbManager != null) dbManager.close()
            dbManager = new DBManager(filePath);
        } catch (ex) {
            setIsLoading(false);
            alert(ex);
            return;
        }

        var firstTableName = null;
        var tableList = $("#tables");

        var rowCounts = dbManager.getTableRowCounts()

        for (const [tableName, rowCount] of Object.entries(rowCounts)) {
            if (firstTableName === null) {
                firstTableName = tableName;
            }
            tableList.append('<option value="' + tableName + '">' + tableName + ' (' + rowCount + ' rows)</option>');
        }

        //Select first table and show It
        tableList.select2("val", firstTableName);
        doDefaultSelect(firstTableName);

        $("#output-box").fadeIn();
        $(".nouploadinfo").hide();
        $("#sample-db-link").hide();
        $("#dropzone").delay(50).animate({height: 50}, 500);
        
        $("#success-box").show();

        setIsLoading(false);

    }, 100);
}

function resetTableList() {
    var tables = $("#tables");
    rowCounts = [];
    tables.empty();
    tables.append("<option></option>");
    tables.select2({
        placeholder: "Select a table",
        formatSelection: selectFormatter,
        formatResult: selectFormatter
    });
    tables.on("change", function (e) {
        doDefaultSelect(e.val);
    });
}

var selectFormatter = function (item) {
    var index = item.text.indexOf("(");
    if (index > -1) {
        var name = item.text.substring(0, index);
        return name + '<span style="color:#ccc">' + item.text.substring(index - 1) + "</span>";
    } else {
        return item.text;
    }
};

function setIsLoading(isLoading) {
    var dropText = $("#drop-text");
    var loading = $("#drop-loading");
    if (isLoading) {
        dropText.hide();
        loading.show();
    } else {
        dropText.show();
        loading.hide();
    }
}

function allowDrop(e) {
    e.preventDefault();
}

function drop(e) {
    var file = e.dataTransfer.files[0]
    console.log(file)
    databaseCheckAndLoad(file.path)
}

function dropzoneClick() {
    //$("#dropzone-dialog").click();
    const options = {filters: [{name: 'Sqlite', extensions: ['sqlite', 'db', 'txt']}], properties: ['openFile', 'multiSelections']}
    //const options = {}
    dialog.showOpenDialog(null, options, (filePaths) => {
        if (filePaths == "undefined") {
            return;
        }

        if (filePaths.length === 1) {
            databaseCheckAndLoad(filePaths[0])
        }
        else if (filePaths.length > 1) {
            if(databaseTransferInProgress) {
                return;
            }

            ipc.send('load-database-from-folder', filePaths)
        }
    });

}

function databaseCheckAndLoad(filePath) {
    if(databaseTransferInProgress) {
        return;
    }

    if(typeof filePath !== "undefined") {
        if(isSqliteFileType(filePath)) {
            loadDB(filePath)
        }
        else {
            showError("File is not sql database.");
        }
    }
}

function isSqliteFileType(filePath) {
    const readChunk = require('read-chunk');
    const fileType = require('file-type');
    
    const buffer = readChunk.sync(filePath, 0, fileType.minimumBytes);
    
    return ((typeof fileType(buffer) !== "undefined") && (fileType(buffer).ext === "sqlite"))
}

function doDefaultSelect(tableName) {
    if (tableName === "daily_activities") {
        $("#sql-editor").show()
        $("#sql-run").show()
    }
    else {
        $("#sql-editor").hide()
        $("#sql-run").hide()
    }

    var defaultSelect = "SELECT * FROM '" + tableName + "' LIMIT 0,30"
    editor.setValue(defaultSelect, -1);
    renderQuery(defaultSelect);
}

function setPage(el, next) {
    var query = editor.getValue();

    var limit = parseLimitFromQuery(query);

    var offset = 0;
    if (next == true) {
        offset = limit.offset + limit.max > limit.rowCount ? limit.offset : limit.offset + limit.max;
    }
    else {
        offset = limit.offset - limit.max < 0 ? limit.offset : limit.offset - limit.max;
    }

    editor.setValue(query.replace(SQL_LIMIT_REGEX, "LIMIT " + offset + "," + limit.max), -1);

    executeSql();
}

function parseLimitFromQuery(query) {
        var sqlRegex = SQL_LIMIT_REGEX.exec(query);
        if (sqlRegex != null) {
            var result = {};

            if (sqlRegex.length > 2 && typeof sqlRegex[2] !== "undefined") {
                result.offset = parseInt(sqlRegex[1]);
                result.max = parseInt(sqlRegex[2]);
            } else {
                result.offset = 0;
                result.max = parseInt(sqlRegex[1]);
            }

            if (result.max == 0) {
                result.pages = 0;
                result.currentPage = 0;
                return(result);
            }

            var queryRowsCount = getQueryRowCount(query);
            if (queryRowsCount != -1) {
                result.pages = Math.ceil(queryRowsCount / result.max);
            }
            result.currentPage = Math.floor(result.offset / result.max) + 1;
            result.rowCount = queryRowsCount;

            return(result);
        } else {
            return null;
        }
}

function getQueryRowCount(query) {
    if (query === lastCachedQueryCount.select) {
            return lastCachedQueryCount.count;
    }

    var queryReplaced = query.replace(SQL_SELECT_REGEX, "SELECT COUNT(*) AS count_sv FROM ");

    if (queryReplaced !== query) {
        queryReplaced = queryReplaced.replace(SQL_LIMIT_REGEX, "");

        lastCachedQueryCount.select = query;
        var tableName = dbManager.getTableNameFromQuery(query)
        var count = dbManager.getTableRowCount(tableName)
        lastCachedQueryCount.count = count

        return count

    } else {
        return -1
    }
}

function executeQueryForNextPage() {
    var query = editor.getValue();

    if (dbManager.getTableNameFromQuery(query) !== "daily_activities") {
        showError("Query can only be executed for daily_activities table");
        return;
    }

    renderQuery(query);
    $("#tables").select2("val", dbManager.getTableNameFromQuery(query));
}

function executeSql() {
    var query = editor.getValue();

    renderQuery(query);
    $("#tables").select2("val", dbManager.getTableNameFromQuery(query));
}

function renderQuery(query) {
    try {
        console.log(new Date().getTime())
        clearTableData();
        console.log(new Date().getTime())
        addColumnHeaders(query);
        console.log(new Date().getTime())
        addRows(query);
        console.log(new Date().getTime())
        showTableData();
        console.log(new Date().getTime())
        refreshPagination(query);
        console.log(new Date().getTime())

        makeDataBoxEditable();
        $('[data-toggle="tooltip"]').tooltip({html: true});
        
        setTimeout(function () {
            positionFooter();
        }, 100);
    }
    catch (ex) {
        showError(ex);
        return;
    }
}

function clearTableData() {
    var dataBox = $("#data");
    var thead = dataBox.find("thead").find("tr");
    var tbody = dataBox.find("tbody");
    thead.empty();
    tbody.empty();
}

function addColumnHeaders(query) {
    var dataBox = $("#data");
    var thead = dataBox.find("thead").find("tr");

    var tableName = dbManager.getTableNameFromQuery(query);
    var columnTypes = dbManager.queryTableColumnTypes(tableName);

    for (var columnName in columnTypes) {
        var columnType = columnTypes[columnName]
        thead.append('<th><span data-toggle="tooltip" data-placement="top" title="' + columnType + '">' + columnName + "</span></th>");
    }
}

function addRows(query) {
    var dataBox = $("#data");
    var tbody = dataBox.find("tbody");

    var queryResults = dbManager.executeQuery(query)

    try {
        for (const row of queryResults.iterate()) {
            var tr = $('<tr>');
            Object.keys(row).forEach(function(column,index) {
                tr.append('<td><span title="' + htmlEncode(row[column]) + '">' + htmlEncode(row[column]) + '</span></td>');
            });
            tbody.append(tr);
        }
    }
    catch(err) {
        queryResults.run()
    }
}

function htmlEncode(value){
    return $('<div/>').text(value).html();
  }

function showTableData() {
    var dataBox = $("#data");
    errorBox.hide();
    dataBox.show();
}

function refreshPagination(query) {
    var limit = parseLimitFromQuery(query);
    if (limit !== null && limit.pages > 0) {
        refreshPager(limit);
        $("#bottom-bar").show();
    } else {
        $("#bottom-bar").hide();
    }
}

function refreshPager(limit) {
    refreshPagerText(limit);
    refreshPagerNextButton(limit);
    refreshPagerBackButton(limit);
}

function refreshPagerText(limit) {
    var pager = $("#pager");
    pager.attr("title", "Row count: " + limit.rowCount);
    pager.text(limit.currentPage + " / " + limit.pages);
}

function refreshPagerNextButton(limit) {
    if ((limit.currentPage + 1) > limit.pages) {
        $("#page-next").addClass("disabled");
    } else {
        $("#page-next").removeClass("disabled");
    }
}

function refreshPagerBackButton(limit) {
    if (limit.currentPage <= 1) {
        $("#page-prev").addClass("disabled");
    } else {
        $("#page-prev").removeClass("disabled");
    }
}

function makeDataBoxEditable() {
    var dataBox = $("#data");
    dataBox.editableTableWidget();
}

function showError(msg) {
    $("#dropzone").hide();
    $("#output-box").fadeIn();
    $("#data").hide();
    $("#bottom-bar").hide();
    errorBox.text(msg);
    errorBox.show();
}

function transferFromMobileClick() {
    console.log("transferFromMobileClick");

    var dropText = $("#drop-loading-message").html("Confirm transfer on mobile phone...")
    setIsLoading(true)

    ipc.send('publish-transfer-service')
}

var databaseUploadProgressPercentage = 0;
var databaseErrorOccured = false
var databaseTransferInProgress = false;

ipc.on('database-upload-status-percentage', function(event, arg) {
    databaseUploadProgressPercentage = arg
})

ipc.on('database-transfer-started', function(event, arg) {
    databaseTransferInProgress = true
    databaseErrorOccured = false
    setTimeout(updateDatabaseTransferProgress, 1000);
})

ipc.on('database-transfer-error', function(event, arg) {
    databaseErrorOccured = true
    $("#drop-loading-message").html("Error occured at " + databaseUploadProgressPercentage + "%. Please go to home page and try again.")
})

function updateDatabaseTransferProgress() {
    if (databaseErrorOccured) return;

    ipc.send('get-database-upload-status-percentage')
    $("#drop-loading-message").html("Database uploading(" + databaseUploadProgressPercentage + "%)...")
    setIsLoading(true)

    if (databaseUploadProgressPercentage != 100) {
        setTimeout(updateDatabaseTransferProgress, 1000);
    }
    else {
        databaseTransferInProgress = false
        loadDB(UPLOADED_DB_PATH)
    }
}

ipc.on('app-is-closing', (event, arg) => {
    if (dbManager != null) {
        dbManager.close()
    }
})

