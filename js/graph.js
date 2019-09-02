const electron = require("electron");
const ipc = electron.ipcRenderer
const Chart = require("chart.js")
const chart_zoom = require("chartjs-plugin-zoom")
const Dygraph = require("dygraphs")

const databasePath = ipc.sendSync('get-database-path')
var db = require('better-sqlite3')(databasePath)


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

setTimeout(function () {

  var tableName = window.process.argv[window.process.argv.length - 1]

  var stmtData = null

  if (tableName === "mobile_data") {
    stmtData = db.prepare("SELECT * FROM mobile_data ORDER BY timestamp")
  }
  else {
    stmtData = db.prepare("SELECT * FROM device_data WHERE node_id='" + tableName + "' ORDER BY timestamp")
  }

  const data = stmtData.all();
  db.close();


  const maxNumberOfPointsPerAxis = 1000
  const threePointInterval = Math.ceil(data.length / maxNumberOfPointsPerAxis);

  // calculate threePointInterval

  var dataset = {};
  var timestamp_label = []

  var threePointAllSensors = {}

  shouldGatherColumnData = true

  for (var i = 0; i < data.length; i++) {
      const columnNames = Object.keys(data[i])

      if (shouldGatherColumnData) {
        for (const name of columnNames) {
            dataset[name] = []
            threePointAllSensors[name] = {min: { x: data[i]['timestamp'], y: data[i][name] }, 
                                          max: { x: data[i]['timestamp'], y: data[i][name] }, 
                                          med: { x: data[i]['timestamp'], y: data[i][name] }, 
                                          sum: 0}
        }
        shouldGatherColumnData = false;
      }

      for (const name of columnNames) {
          threePointAllSensors[name].sum += data[i][name]

          if (data[i][name] > threePointAllSensors[name].max.y) {
            threePointAllSensors[name].max.y = data[i][name];
            threePointAllSensors[name].max.x = data[i]['timestamp'];
          }
          else if (data[i][name] < threePointAllSensors[name].min.y) {
            threePointAllSensors[name].min.y = data[i][name];
            threePointAllSensors[name].min.x = data[i]['timestamp'];
          }

      }

      if (i !== 0 && (i % threePointInterval) === 0) {
        //timestamp_label.push(new Date(data[i]['timestamp']).toLocaleString())
        timestamp_label.push(data[i]['timestamp'])

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
          
            threePointAllSensors[name].med.x = data[medianValue.index]['timestamp']
            threePointAllSensors[name].med.y = medianValue.value

            var tmp = []
            tmp.push(threePointAllSensors[name].min);
            tmp.push(threePointAllSensors[name].max);
            tmp.push(threePointAllSensors[name].med);
            tmp.sort((a, b) => (a.x > b.x) ? 1 : -1)
            for (var k = 0; k < tmp.length; k++) {
              dataset[name].push(tmp[k])
            }

            threePointAllSensors[name] = {min: { x: data[i]['timestamp'], y: data[i][name] }, 
                                          max: { x: data[i]['timestamp'], y: data[i][name] }, 
                                          med: { x: data[i]['timestamp'], y: data[i][name] }, 
                                          sum: 0}
        }
      }

      
  }

  var dataPreparedForGraph = []

  var x_axis = [{
    type: 'time',
    display: true,
    ticks: {
      beginAtZero: false
    },
    time: {
        displayFormats: {
            quarter: 'MMM YYYY'
        }
    }
  }]

  const sensors = Object.keys(dataset)
  for (const sensorDataLabel of sensors) {
      if((sensorDataLabel === "timestamp") || (sensorDataLabel === "node_id")) continue;
      var graphDataEntry = {
          "data": dataset[sensorDataLabel],
          "label": sensorDataLabel,
          "borderColor": generateRandomColor(),
          "fill": false,
          "id": sensorDataLabel
      }

      x_axis.push({
        id: sensorDataLabel,
        ticks: {
          beginAtZero: false
        },
        type: 'linear',
        time: {
          displayFormats: {
              quarter: 'MMM YYYY'
          }
        },
        position: 'bottom',
        display: false
      })

      dataPreparedForGraph.push(graphDataEntry)
  }


  var ch = new Chart(document.getElementById("sensorGraph"), {
      type: 'scatter',
      data: {
        labels: timestamp_label,
        datasets: dataPreparedForGraph
      },
      options: {
        title: {
          display: true,
          text: tableName
        },
        scales: {
        xAxes: x_axis
      },
      animation: {
        duration: 0 // general animation time
      },
      hover: {
          animationDuration: 0 // duration of animations when hovering an item
      },
      responsiveAnimationDuration: 0, // animation duration after a resize
      elements: {
              line: {
                  tension: 0 // disables bezier curves
              },
              point: {
                radius: 1
              }
          },
      showLines: false, // disable for all datasets. Use false in case performance is very bad.
      plugins: {
            zoom: {
              // Container for pan options
              pan: {
                  // Boolean to enable panning
                  enabled: true,
      
                  // Panning directions. Remove the appropriate direction to disable
                  // Eg. 'y' would only allow panning in the y direction
                  mode: 'xy',
      
                  rangeMin: {
                      // Format of min pan range depends on scale type
                      x: null,
                      y: null
                  },
                  rangeMax: {
                      // Format of max pan range depends on scale type
                      x: null,
                      y: null
                  },
              },
      
              // Container for zoom options
              zoom: {
                  // Boolean to enable zooming
                  enabled: true,
      
                  // Enable drag-to-zoom behavior
                  drag: false,
      
                  // Drag-to-zoom rectangle style can be customized
                  // drag: {
                  // 	 borderColor: 'rgba(225,225,225,0.3)'
                  // 	 borderWidth: 5,
                  // 	 backgroundColor: 'rgb(225,225,225)'
                  // },
      
                  // Zooming directions. Remove the appropriate direction to disable
                  // Eg. 'y' would only allow zooming in the y direction
                  mode: 'xy',
      
                  rangeMin: {
                      // Format of min zoom range depends on scale type
                      x: null,
                      y: null
                  },
                  rangeMax: {
                      // Format of max zoom range depends on scale type
                      x: null,
                      y: null
                  },
      
                  // Speed of zoom via mouse wheel
                  // (percentage of zoom on a wheel event)
                  speed: 0.3,
              }
            }
          }
      }
    });

    setIsLoading(false)

}, 100);



function generateRandomColor() {
    return '#'+(Math.random()*0xFFFFFF<<0).toString(16);
}