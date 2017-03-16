#!/usr/bin/env node

var fs = require('fs');
var see = require('../index.js');

var seqStream = see('rna', {
  convertToExpected: true
});

fs.createReadStream('../sample_data/test.sbol').pipe(seqStream);

seqStream.on('data', function(data) {
  console.log(data);
});

seqStream.on('error', function(err) {
  console.error(err);
});

seqStream.on('end', function(data) {
  console.log("stream ended");
});
