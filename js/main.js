const electron = require("electron");
const fileSystem = require("fs").promises
const ipc = electron.ipcRenderer

var SQL_FROM_REGEX = /FROM\s+([^\s;]+)/mi;
var SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
var SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;

var db = null;
var rowCounts = [];
var editor = ace.edit("sql-editor");
var bottomBarDefaultPos = null, bottomBarDisplayStyle = null;
var errorBox = $("#error");
//var queryResult = new Object();
var lastCachedQueryCount = {};

var fileReaderOpts = {
    readAsDefault: "ArrayBuffer", on: {
        load: function (e, file) {
            loadDB(e.target.result);
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
    $('#dropzone, #dropzone-dialog').fileReaderJS(fileReaderOpts);
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
windowResize();

$(".no-propagate").on("click", function (el) { el.stopPropagation(); });

function loadDB(arrayBuffer) {
    setIsLoading(true);

    resetTableList();

    setTimeout(function () {
        var tables;
        try {
            db = new SQL.Database(new Uint8Array(arrayBuffer));

            storeDatabase();
            //Get all table names from master table
            tables = db.prepare("SELECT * FROM sqlite_master WHERE type='table' ORDER BY name");
        } catch (ex) {
            setIsLoading(false);
            alert(ex);
            return;
        }

        var firstTableName = null;
        var tableList = $("#tables");

        while (tables.step()) {
            var rowObj = tables.getAsObject();
            var name = rowObj.name;

            if (firstTableName === null) {
                firstTableName = name;
            }
            var rowCount = getTableRowsCount(name);
            rowCounts[name] = rowCount;
            tableList.append('<option value="' + name + '">' + name + ' (' + rowCount + ' rows)</option>');
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
    }, 50);
}

async function storeDatabase() {
    var data = db.export();
    var buffer = new Buffer(data);

    console.log("File writting has been started")
    await fileSystem.writeFile('./tmp/db.sqlite', buffer);
    console.log("File has been written to disk")
    ipc.send('start-database-conversions')
}

function getTableRowsCount(name) {
    var sel = db.prepare("SELECT COUNT(*) AS count FROM '" + name + "'");
    if (sel.step()) {
        return sel.getAsObject().count;
    } else {
        return -1;
    }
}

function getQueryRowCount(query) {
    if (query === lastCachedQueryCount.select) {
        return lastCachedQueryCount.count;
    }

    var queryReplaced = query.replace(SQL_SELECT_REGEX, "SELECT COUNT(*) AS count_sv FROM ");

    if (queryReplaced !== query) {
        queryReplaced = queryReplaced.replace(SQL_LIMIT_REGEX, "");

        var sel = db.prepare(queryReplaced);
        if (sel.step()) {
            var count = sel.getAsObject().count_sv;

            lastCachedQueryCount.select = query;
            lastCachedQueryCount.count = count;

            return count;
        } else {
            return -1;
        }
    } else {
        return -1;
    }
}

function getTableColumnTypes(tableName) {
    var result = new Object();
    var sel = db.prepare("PRAGMA table_info('" + tableName + "')");

    while (sel.step()) {
        var obj = sel.getAsObject();
        result[obj.name] = obj.type;
    }

    return result;
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

function extractFileNameWithoutExt(filename) {
    var dotIndex = filename.lastIndexOf(".");
    if (dotIndex > -1) {
        return filename.substr(0, dotIndex);
    } else {
        return filename;
    }
}

function dropzoneClick() {
    $("#dropzone-dialog").click();
}

function doDefaultSelect(name) {
    var defaultSelect = "SELECT * FROM '" + name + "' LIMIT 0,30";
    editor.setValue(defaultSelect, -1);
    renderQuery(defaultSelect);
}

function getTableNameFromQuery(query) {
    var sqlRegex = SQL_FROM_REGEX.exec(query);
    if (sqlRegex != null) {
        return sqlRegex[1].replace(/"|'/gi, "");
    } else {
        return null;
    }
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
            return result;
        }

        var queryRowsCount = getQueryRowCount(query);
        if (queryRowsCount != -1) {
            result.pages = Math.ceil(queryRowsCount / result.max);
        }
        result.currentPage = Math.floor(result.offset / result.max) + 1;
        result.rowCount = queryRowsCount;

        return result;
    } else {
        return null;
    }
}

function executeSql() {
    var query = editor.getValue();
    renderQuery(query);
    $("#tables").select2("val", getTableNameFromQuery(query));
}

function renderQuery(query) {
    try {
        clearTableData();
        addColumnHeaders(query);
        addRows(query);
        showTableData();

        refreshPagination(query);

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

    var tableName = getTableNameFromQuery(query);
    var columnTypes = getTableColumnTypes(tableName);

    for (var columnName in columnTypes) {
        var columnType = columnTypes[columnName]
        thead.append('<th><span data-toggle="tooltip" data-placement="top" title="' + columnType + '">' + columnName + "</span></th>");
    }
}

function addRows(query) {
    var dataBox = $("#data");
    var tbody = dataBox.find("tbody");

    var sel = db.prepare(query);
    while (sel.step()) {
        var tr = $('<tr>');
        var s = sel.get();
        for (var i = 0; i < s.length; i++) {
            tr.append('<td><span title="' + htmlEncode(s[i]) + '">' + htmlEncode(s[i]) + '</span></td>');
        }
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

    ipc.send('publish-transfer-service')
}


/*function executeQuery(query) {
    queryResult = new Object();
    var tableName = getTableNameFromQuery(query);
    queryResult['tableName'] = tableName;
    queryResult['columnTypes'] = getTableColumnTypes(tableName);

    queryResult['resultRows'] = []
    var sel = db.prepare(query);
    while (sel.step()) {
        queryResult['resultRows'].push(sel.get());
    }

    return queryResult;
}*/