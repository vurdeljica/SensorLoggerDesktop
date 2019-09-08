const electron = require("electron");
const protobuf = require('protobufjs')
const fileSystem = require('fs')
const zlib = require('zlib');

var exports = module.exports = {}

const DBCreationManager = require('./js/db-creation-manager')
var dbManager

exports.init = function(shouldCreate) {
    dbManager = new DBCreationManager(shouldCreate);
}

exports.restore = function(filePath, fileType) {
    if (fileType === 0) {
        return new Promise( (resolve, reject) => {
            
            const data =  fileSystem.readFileSync(filePath, "utf8");
            var dailyActivitiesJSON = JSON.parse(data);
            dbManager.insertJSONarray(dailyActivitiesJSON);

            resolve({
                code : 200,
                message : "Decompression success"
            })
        })
    }
    else {
        return decompress(filePath, fileType)
    }
}
exports.finish = function() {
    dbManager.close()
}

function decompress(filePath, fileType) {
    return new Promise( (resolve, reject) => { 
        const fileContents = fileSystem.createReadStream(filePath);
        const unzip = zlib.createInflate();
        var writeStream = new WMStrm();

        fileContents.pipe(unzip).pipe(writeStream).on('finish', (err) => {
            deserialize(writeStream.memStore, fileType).then(() => {
                resolve({
                    code : 200,
                    message : "Decompression success"
                })
            })
        })
    })
}



var stream = require('stream');
var util = require('util');
// use Node.js Writable, otherwise load polyfill
var Writable = stream.Writable ||
  require('readable-stream').Writable;

function WMStrm(options) {
  // allow use without new operator
  if (!(this instanceof WMStrm)) {
    return new WMStrm(options);
  }
  Writable.call(this, options); // init super
  this.memStore = Buffer.from(''); // empty
}
util.inherits(WMStrm, Writable);

WMStrm.prototype._write = function (chunk, enc, cb) {
  // our memory store stores things in buffers
  var buffer = (Buffer.isBuffer(chunk)) ?
    chunk :  // already is Buffer use it
    Buffer.from(chunk, enc);  // string, convert

  // concat to the buffer already there
  this.memStore = Buffer.concat([this.memStore, buffer]);
  cb();
};



function deserialize(_fileData, _fileType) {
    const fileData = _fileData
    const fileType = _fileType
    return new Promise( (resolve, reject) => { 
            var reader = protobuf.Reader.create(fileData);
            var sensorDataBuffer = []
            while(reader.pos < reader.len) {
                var sensorData;
                if (fileType === 1) {
                    sensorData = require('./sensordata.js').MobileData.decodeDelimited(reader)
                }
                else if (fileType === 2) {
                    sensorData = require('./sensordata.js').DeviceData.decodeDelimited(reader)
                }

                sensorData = fixInt64(sensorData)
                sensorDataBuffer.push(sensorData)
            }

            if (fileType === 1) {
                dbManager.insertMobileSensorData(sensorDataBuffer)
            }
            else if (fileType === 2) {
                dbManager.insertDeviceSensorData(sensorDataBuffer)
            }

            resolve({
                code : 200,
                message : "Decompression success"
            })
    })
}

var fixInt64 = function(obj) {
    for(var key in obj) {
        if(typeof obj[key] === 'object'){
            fixInt64(obj[key]);
        }
        if(obj[key] instanceof protobuf.util.Long){
            obj[key] = obj[key].toNumber();
        }
    }
    return obj;
}