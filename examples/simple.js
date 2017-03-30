#!/usr/bin/env node

var brake = require('brake');
var fs = require('fs');
var sse = require('../index.js');

var seqStream = sse('auto', {
  convertToExpected: true,
  header: function(count) {
    return "sample header " + count;
  }
});

// read sequence data from file and pipe into seqStream
// but throttle to 20000 bytes per second
fs.createReadStream('../sample_data/test.sbol').pipe(brake(20000)).pipe(seqStream);

seqStream.on('data', function(data) {
  process.stdout.write(data);
});

seqStream.on('error', function(err) {
  console.error(err);
});

seqStream.on('end', function(data) {
  console.log("stream ended");
});

