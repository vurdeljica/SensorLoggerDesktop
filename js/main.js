const electron = require("electron");
const { dialog } = require('electron').remote
const ipc = electron.ipcRenderer

var SQL_FROM_REGEX = /FROM\s+([^\s;]+)/mi;
var SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
var SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;

var dbManager = null;
var editor = ace.edit("sql-editor");
var bottomBarDefaultPos = null, bottomBarDisplayStyle = null;
var errorBox = $("#error");
//var queryResult = new Object();
var lastCachedQueryCount = {};


ipc.on('show-home-page', function(event, arg) {
    setIsLoading(false);
    $(".nouploadinfo").show();
    $("#sample-db-link").show();
    $("#output-box").hide();
    $("#success-box").hide();
    $("#bottom-bar").hide();
    $("#dropzone").delay(50).animate({height: 497}, 500);

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
    setIsLoading(true);

    resetTableList();

    ipc.send('database-file-path', filePath)

    setTimeout(function () {
        try {
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

function dropzoneClick() {
    //$("#dropzone-dialog").click();
    const options = {filters: [{name: 'Sqlite', extensions: ['sqlite', 'db'] }]}
    dialog.showOpenDialog(null, options, (filePaths) => {
        if(typeof filePaths !== "undefined") {
            loadDB(filePaths[0])
        }
    });
}

function doDefaultSelect(tableName) {
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

    for (const row of queryResults.iterate()) {
        var tr = $('<tr>');
        Object.keys(row).forEach(function(column,index) {
            tr.append('<td><span title="' + htmlEncode(row[column]) + '">' + htmlEncode(row[column]) + '</span></td>');
        });
        tbody.append(tr);
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
    pager.tooltip('fixTitle');
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
    $("#data").hide();
    $("#bottom-bar").hide();
    errorBox.show();
    errorBox.text(msg);
}


function transferFromMobileClick() {
    console.log("transferFromMobileClick");

    var dropText = $("#drop-loading-message").html("Confirm transfer on mobile phone...")
    setIsLoading(true)

    ipc.send('publish-transfer-service')
}


ipc.on('database-upload-status-percentage', function(event, arg) {
    databaseUploadProgressPercentage = arg
})

var databaseUploadProgressPercentage = 0;

function updateDatabaseTransferProgress() {
    ipc.send('get-database-upload-status-percentage')
    //var dropText = $("#drop-loading-message").html("Database uploading(" + databaseUploadProgressPercentage + "%)...")

    if (databaseUploadProgressPercentage != 100) {
        setTimeout(updateDatabaseTransferProgress, 1000);
    }
}

setTimeout(updateDatabaseTransferProgress, 1000);
