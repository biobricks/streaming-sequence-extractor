#!/usr/bin/env node

var util = require('util');
var through = require('through2');
var brake = require('brake');
var fs = require('fs');
var see = require('../index.js');

var seqStream = see('auto', {
  convertToExpected: true,
  header: function(count) {
    return "sample header " + count;
  }
});

// read sequence data from file and pipe into seqStream
// but throttle to 500 bytes per second
fs.createReadStream('../sample_data/test.multi').pipe(brake(20000)).pipe(seqStream);

seqStream.on('data', function(data) {
  process.stdout.write(data);
//  console.log(data);
});

seqStream.on('error', function(err) {
  console.error(err);
});

seqStream.on('end', function(data) {
  console.log("stream ended");
});
