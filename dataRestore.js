const electron = require("electron");
const protobuf = require('protobufjs')
const fileSystem = require('fs')
const zlib = require('zlib');

var exports = module.exports = {}

const DBCreationManager = require('./js/db-creation-manager')
var dbManager

/**
 * Init function. Open connection to database
 * 
 * @param {Boolean} shouldCreate flag that indicates should database be
 * created, or only to open connection to existing database
 */
exports.init = function(shouldCreate) {
    dbManager = new DBCreationManager(shouldCreate);
}

/**
 * Restore serialized and compressed file and puts data
 * in database.
 * 
 * @param {String} _filePath Absoulte path of the file which should be restored
 * @param {String} _fileType File type of the file which should be restored
 */
exports.restore = function(_filePath, _fileType) {
    const filePath = _filePath;
    const fileType = _fileType
    if (fileType === 0) {
        return new Promise((resolve, reject) => {
            try {
                const data =  fileSystem.readFileSync(filePath, "utf8");
                var dailyActivitiesJSON = JSON.parse(data);
                dbManager.insertJSONarray(dailyActivitiesJSON);

                resolve({
                    code : 200,
                    message : "Decompression success"
                })
            }
            catch(exception) {
                reject("Error while using json file")
            }
        })
    }
    else {
        return decompress(filePath, fileType)
    }
}

/**
 * Finish data restoring. Close database connection.
 */
exports.finish = function() {
    if (dbManager != undefined) {
        dbManager.close()
    }
}

/**
 * Decompress file. On success it starts deserialization of 
 * decompressed data.
 * 
 * @param {*} filePath Absoulte path of the file which should be decompressed
 * @param {*} fileType File type of the file which should be decompressed
 */
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
        .on('error', (err) => {
            reject("Error while decompressing")
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


/**
 * Deserialize data using proto schema. When deserialization is done
 * it inserts data in database.
 * 
 * @param {*} _fileData Absoulte path of the file which should be deserialized
 * @param {*} _fileType File type of the file which should be deserialized
 */
function deserialize(_fileData, _fileType) {
    const fileData = _fileData
    const fileType = _fileType
    return new Promise( (resolve, reject) => {
        try {
            var reader = protobuf.Reader.create(fileData);
            var sensorDataBuffer = []
            while(reader.pos < reader.len) {
                var sensorData;
                if (fileType === 1) {
                    sensorData = require('./sensordata.js').LocationData.decodeDelimited(reader)
                }
                else if (fileType === 2) {
                    sensorData = require('./sensordata.js').SensorData.decodeDelimited(reader)
                }

                sensorData = fixInt64(sensorData)
                sensorDataBuffer.push(sensorData)
            }

            if (fileType === 1) {
                dbManager.insertLocationData(sensorDataBuffer)
            }
            else if (fileType === 2) {
                dbManager.insertDeviceData(sensorDataBuffer)
            }

            resolve({
                code : 200,
                message : "Decompression success"
            })
        }
        catch (exception) {
            console.log(exception)
            reject("Error while deserializing")
        }
    })
}

/**
 * Recursive function that find all long fields of the object and
 * converts them to number. JavaScript doesn't have support for 
 * 64-bit integers and all long fields has to be converted to Number.
 * 
 * @param {Object} obj 
 */
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