const electron = require("electron");
const ipc = electron.ipcRenderer

var Highcharts = require('highcharts/highstock');
require('highcharts/modules/exporting')(Highcharts);

const databasePath = ipc.sendSync('get-database-path')
var db = require('better-sqlite3')(databasePath)

/**
 * Toogle graph window on or off loading state
 * 
 * @param {Boolean} isLoading true - set window to loading state
 * false - turn off loading state
 */
function setIsLoading(isLoading) {
  var loading = $("#graph-loading");
  var graph = $("#graph")
  if (isLoading) {
      loading.show();
      graph.hide()
  } else {
      loading.hide();
      graph.show();
  }
}

setIsLoading(true)

var tableName = window.process.argv[window.process.argv.length - 1]
var stmtCount = null
if (tableName === "location_data") {
  stmtCount = db.prepare("select count(*) as cnt from location_data")
}
else {
  stmtCount = db.prepare("select count(*) as cnt from sensor_data WHERE node_id='" + tableName + "'")
}

const totalNumOfData = (stmtCount.all())[0].cnt

const maxNumberOfPointsPerAxis = 5000
const threePointInterval = Math.ceil(totalNumOfData / maxNumberOfPointsPerAxis);

var dataPreparedForGraph = []
var timestamp_label = []
setTimeout(function () {

  var offset = 0;
  var numOfRows = 1000000;
  var stmtData = null

  /**
   * This loop is essential for graph creation. Number of points can be huge and it must be reduced. 
   * Data points are separated in intervals and from each interval three dots are taken. Three dots 
   * represent min, max and median value on the interval. Size of the interval is calculated from 
   * total number of dots and number of dots that highcharts support.
   */
  while(true) {
    if (tableName === "location_data") {
      stmtData = db.prepare("SELECT * FROM location_data ORDER BY timestamp limit " + offset + "," + numOfRows)
    }
    else {
      stmtData = db.prepare("SELECT * FROM sensor_data WHERE node_id='" + tableName + "' ORDER BY timestamp limit " + offset + "," + numOfRows)
    }

    offset += numOfRows

    const data = stmtData.all();

    if(Object.entries(data).length === 0) {
      break; // no more data to be read
    }

    // calculate threePointInterval

    var dataset = {};

    var threePointAllSensors = {}

    shouldGatherColumnData = true

    for (var i = 0; i < data.length; i++) {
        const columnNames = Object.keys(data[i])

        if (shouldGatherColumnData) {
          for (const name of columnNames) {
              dataset[name] = []
              threePointAllSensors[name] = {min: { x: new Date(data[i]['timestamp']), y: data[i][name] }, 
                                            max: { x: new Date(data[i]['timestamp']), y: data[i][name] }, 
                                            med: { x: new Date(data[i]['timestamp']), y: data[i][name] }, 
                                            sum: 0}
          }
          shouldGatherColumnData = false;
        }

        for (const name of columnNames) {
            threePointAllSensors[name].sum += data[i][name]

            if (data[i][name] > threePointAllSensors[name].max.y) {
              threePointAllSensors[name].max.y = data[i][name];
              threePointAllSensors[name].max.x = new Date(data[i]['timestamp']);
            }
            else if (data[i][name] < threePointAllSensors[name].min.y) {
              threePointAllSensors[name].min.y = data[i][name];
              threePointAllSensors[name].min.x = new Date(data[i]['timestamp']);
            }

        }

        if (i !== 0 && (i % threePointInterval) === 0) {
          timestamp_label.push(new Date(data[i]['timestamp']))

          const columnNames = Object.keys(data[i])
          for (const name of columnNames) {
              threePointAllSensors[name].sum /= threePointInterval
              var medianValue = {"index": 0, "value": 0}
              var minDistance = Number.MAX_VALUE
            
              for (j = (i - threePointInterval); j <= i; j++) {
                var distance = Math.abs(threePointAllSensors[name].sum - data[j][name])
                if (distance < minDistance) {
                  minDistance = distance;
                  medianValue.index = j;
                  medianValue.value = data[j][name]
                } 
              }
            
              threePointAllSensors[name].med.x = new Date(data[medianValue.index]['timestamp'])
              threePointAllSensors[name].med.y = medianValue.value

              var tmp = []
              tmp.push(threePointAllSensors[name].min);
              tmp.push(threePointAllSensors[name].max);
              tmp.push(threePointAllSensors[name].med);
              tmp.sort((a, b) => (a.x > b.x) ? 1 : -1)

              const tmp_filtered = tmp.filter((point,index) => {
                return index === tmp.findIndex(obj => {
                  return JSON.stringify(obj) === JSON.stringify(point);
                });
              });
              
              
              for (var k = 0; k < tmp_filtered.length; k++) {
                dataset[name].push([tmp_filtered[k].x, tmp_filtered[k].y])
              }

              threePointAllSensors[name] = {min: { x: new Date(data[i]['timestamp']), y: data[i][name] }, 
                                            max: { x: new Date(data[i]['timestamp']), y: data[i][name] }, 
                                            med: { x: new Date(data[i]['timestamp']), y: data[i][name] }, 
                                            sum: 0}
          }
        }

        
    }
  }

  db.close();

  var first = true
  const sensors = Object.keys(dataset)
  for (const sensorDataLabel of sensors) {
      if((sensorDataLabel === "timestamp") || (sensorDataLabel === "node_id")) continue;
      var graphDataEntry = {
          "showInLegend":true,
          "data": dataset[sensorDataLabel],
          "visible": first,
          "name": sensorDataLabel
      }

      first = false
      dataPreparedForGraph.push(graphDataEntry)
  }

  createChart()
  setIsLoading(false)

}, 100);

 

/**
 * Create the chart when all data is loaded
 * @returns {undefined}
 */
function createChart() {
  Highcharts.setOptions({
      global: {
          useUTC: false
      }
  });

  Highcharts.stockChart('graph', {
    chart: {
        type: 'scatter',
        zoomType: 'x',
        panning: true,
        panKey: 'shift'
    },
    boost: {
      seriesThreshold: 2,
      enabled: true,
      useGPUTranslations: true,
      usePreAllocated: true
    },
    title: {
        text: tableName
    },
    legend: {
      enabled: true
    },
    xAxis: {
        type: 'datetime',
        dateTimeLabelFormats: {
            month: '%e. %b',
            year: '%b'
        },
        title: {
            text: 'Date'
        },
        min: timestamp_label[0].getTime(),
        max: timestamp_label[timestamp_label.length - 1].getTime(),
        minRange: 3600
    },
    yAxis: {
        title: {
            text: 'Sensor value'
        }
    },
    tooltip: {
        headerFormat: '<b>{series.name}</b><br>',
        pointFormat: '{point.x:%e. %b}: {point.y:.2f}'
    },
    plotOptions: {
      columnrange: {
        grouping: true
      },
      series: {
        marker: {
          enabled: true
        },
      },
    },
    rangeSelector: {
      enabled: true,
      inputEnabled: true,
      allButtonsEnabled: true,
      buttons: [{
          type: 'hour',
          count: 1,
          text: 'hour'
      },{
          type: 'day',
          count: 1,
          text: 'day'
      }, {
          type: 'week',
          count: 1,
          text: 'week'
      }],
      selected: 0
    },
    series: dataPreparedForGraph
  });
}