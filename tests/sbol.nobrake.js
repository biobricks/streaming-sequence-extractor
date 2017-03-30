
var path = require('path');
var fs = require('fs');
var test = require('tape');
var sse = require('../index.js');


// parse genbank stream
test('SBOL (no brake)', function(t) {

  t.plan(1); // plan one test

  var output = '';

  var seqStream = sse('auto', {
    convertToExpected: true,
    header: function(count) {
      return "sample header " + count;
    }
  });

  if(!seqStream) t.fail("constructor failed");
  
  // read sequence data from file and pipe into seqStream
  // but throttle to 20000 bytes per second
  fs.createReadStream(path.join('sample_data', 'test.sbol')).pipe(seqStream);
  
  seqStream.on('data', function(data) {
    output += data;
  });
  
  seqStream.on('error', function(err) {
    if(!seqStream) t.end(err);
  });
  
  seqStream.on('end', function(data) {
    fs.readFile(path.join('tests', 'expected_output', 'sbol.js.output'), {encoding: 'utf8'}, function(err, data) {
      if(err) return t.end(err);

      // verify output
      t.equal(data.trim(), output.trim())

      t.end();
    });
  });
});
