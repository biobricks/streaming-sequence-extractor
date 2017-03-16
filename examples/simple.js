#!/usr/bin/env node

var fs = require('fs');
var see = require('../index.js');

var seqStream = see('auto', {
  convertToExpected: true,
  header: function(count) {
    return "sample header " + count;
  }
});

fs.createReadStream('../sample_data/test.multi').pipe(seqStream);

seqStream.on('data', function(data) {
  console.log(data);
});

seqStream.on('error', function(err) {
  console.error(err);
});

seqStream.on('end', function(data) {
  console.log("stream ended");
});
