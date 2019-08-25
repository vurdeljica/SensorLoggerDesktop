const electron = require("electron");
const ipc = electron.ipcRenderer
const Chart = require("chart.js")
const chart_zoom = require("chartjs-plugin-zoom")
const Dygraph = require("dygraphs")

const databasePath = ipc.sendSync('get-database-path')
var db = require('better-sqlite3')(databasePath)

var maxRenderedPointsX = 10000;

const stmt = db.prepare("SELECT * FROM mobile_data ORDER BY timestamp")
const data = stmt.all();

var x_axis = [] // x_axis
var y1_axis= [] // y1_axis
var y2_axis = [] // y2_axis

var dataset = {};
var averageData = {}

//var dygrafTable = [     // 2D-array
//  ];

shouldGatherColumnData = true

/*for (var i = 0; i < data.length; i++) {
    if (shouldGatherColumnData) {
        const columnNames = Object.keys(data[i])
        for (const name of columnNames) {
            dataset[name] = []
            averageData[name] = 0
        }
        shouldGatherColumnData = false;
    }

    const columnNames = Object.keys(data[i])
    for (const name of columnNames) {
        averageData[name] += data[i][name]
    }

    if ((i % (33 * 60)) === 0) {
        for (const name of columnNames) {
            averageData[name] /= (33 * 60)
            dataset[name].push(averageData[name])
            averageData[name] = 0
        }
    }
    
}*/


for (var i = 0; i < data.length; i++) {
    if (i % 300 == 0) {
    if (shouldGatherColumnData) {
        const columnNames = Object.keys(data[i])
        for (const name of columnNames) {
            dataset[name] = []
            averageData[name] = 0
        }
        shouldGatherColumnData = false;
    }

    const columnNames = Object.keys(data[i])
    for (const name of columnNames) {
        dataset[name].push(data[i][name]);
    }
}
    
}

var dataPreparedForGraph = []

const sensors = Object.keys(dataset)
for (const sensorDataLabel of sensors) {
    if(sensorDataLabel === "timestamp") continue;
    var graphDataEntry = {
        "data": dataset[sensorDataLabel],
        "label": sensorDataLabel,
        "borderColor": generateRandomColor(),
        "fill": false
    }
    console.log(graphDataEntry)
    dataPreparedForGraph.push(graphDataEntry)
}



  /*const g = new Dygraph(
      document.getElementById("graphdiv"),     // where to plot
      dygrafTable,
      {width: 1000, height: 1000}
  );
*/
//console.log(x_axis.length)1566505382279.007
console.log(dataset['timestamp'])
//dataset['timestamp'][0] = 1566505382179.007

var ch = new Chart(document.getElementById("sensorGraph"), {
    type: 'line',
    data: {
      labels: dataset['timestamp'],
      datasets: dataPreparedForGraph
    },
    options: {
      title: {
        display: true,
        text: 'World population per region (in millions)'
      },
      scales: {
        xAxes: [{
            type: 'time',
            time: {
                displayFormats: {
                    quarter: 'MMM YYYY'
                }
            }
        }]
    },
    elements: {
            line: {
                tension: 0 // disables bezier curves
            }
        },
    showLines: true, // disable for all datasets. Use false in case performance is very bad.
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
                
                // Function called while the user is panning
                onPan: function({chart}) { console.log(`I'm panning!!!`); },
                // Function called once panning is completed
                onPanComplete: function({chart}) { console.log(`I was panned!!!`); }
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
                speed: 0.1,
    
                // Function called while the user is zooming
                onZoom: function({chart}) { console.log(`I'm zooming!!!`); },
                // Function called once zooming is completed
                onZoomComplete: function({chart}) { console.log(`I was zoomed!!!`); }
            }
        }
    },
        animation: {
            duration: 0 // general animation time
        },
        hover: {
            animationDuration: 0 // duration of animations when hovering an item
        },
        responsiveAnimationDuration: 0 // animation duration after a resize
    }
  });


function generateRandomColor() {
    return '#'+(Math.random()*0xFFFFFF<<0).toString(16);
}

/*new Chart(document.getElementById("sensorGraph"), {
    type: 'line',
    data: {
      labels: [1500,1600,1700,1750,1800,1850,1900,1950,1999,2050],
      datasets: [{ 
          data: [86,114,106,106,107,111,133,221,783,2478],
          label: "Africa",
          borderColor: "#3e95cd",
          fill: false
        }, { 
          data: [282,350,411,502,635,809,947,1402,3700,5267],
          label: "Asia",
          borderColor: "#8e5ea2",
          fill: false
        }, { 
          data: [168,170,178,190,203,276,408,547,675,734],
          label: "Europe",
          borderColor: "#3cba9f",
          fill: false
        }, { 
          data: [40,20,10,16,24,38,74,167,508,784],
          label: "Latin America",
          borderColor: "#e8c3b9",
          fill: false
        }, { 
          data: [6,3,2,2,7,26,82,172,312,433],
          label: "North America",
          borderColor: "#c45850",
          fill: false
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: 'World population per region (in millions)'
      }
    }
  });
  */

 var reduceDataPointsPlugin = {
    beforeUpdate: function (chart, options) {
        console.log("dfdffdfdf")
      filterData(chart);
    }
  };
  

 function filterData(chart) {
    var datasets = chart.data.datasets;
    if (!chart.data.origDatasetsData) {
      chart.data.origDatasetsData = [];
      for (var i in datasets) {
        chart.data.origDatasetsData.push(datasets[i].data);
      }
    }
    var originalDatasetsData = chart.data.origDatasetsData;
    var chartOptions = chart.options.scales.xAxes[0];
    var startX = chartOptions.time.min;
    var endX = chartOptions.time.max;
  
    if (startX && typeof startX === 'object')
      startX = startX._d.getTime();
    if (endX && typeof endX === 'object')
      endX = endX._d.getTime();
  
    for (var i = 0; i < originalDatasetsData.length; i++) {
      var originalData = originalDatasetsData[i];
  
      if (!originalData.length)
        continue;
  
      var firstElement = {
        index: 0,
        time: null
      };
      var lastElement = {
        index: originalData.length - 1,
        time: null
      };
  
      for (var j = 0; j < originalData.length; j++) {
        var time = originalData[j].x;
        if (time >= startX && (firstElement.time === null || time < firstElement.time)) {
          firstElement.index = j;
          firstElement.time = time;
        }
        if (time <= endX && (lastElement.time === null || time > lastElement.time)) {
          lastElement.index = j;
          lastElement.time = time;
        }
      }
      var startIndex = firstElement.index <= lastElement.index ? firstElement.index : lastElement.index;
      var endIndex = firstElement.index >= lastElement.index ? firstElement.index : lastElement.index;
      datasets[i].data = reduce(originalData.slice(startIndex, endIndex + 1), maxRenderedPointsX);
    }
  }
  
  // returns a reduced version of the data array, averaging x and y values
  function reduce(data, maxCount) {
    if (data.length <= maxCount)
      return data;
    var blockSize = data.length / maxCount;
    var reduced = [];
    for (var i = 0; i < data.length;) {
      var chunk = data.slice(i, (i += blockSize) + 1);
      reduced.push(average(chunk));
    }
    return reduced;
  }
  
  function average(chunk) {
    var x = 0;
    var y = 0;
    for (var i = 0; i < chunk.length; i++) {
      x += chunk[i].x;
      y += chunk[i].y;
    }
    return {
      x: Math.round(x / chunk.length),
      y: y / chunk.length
    };
  }