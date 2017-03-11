
var sax = require('sax');

function sbolExtractor = function() {

var parser = sax.createStream(false, {trim: false});

var TAG_NONE = 0;
var TAG_RDF = 1;
var TAG_SEQUENCE = 2;
var TAG_ELEMENTS = 3;

var inTag = 0;

parser.on('opentag', function(node) {
  switch(inTag) {
    case TAG_NONE:
    if(node.name === 'RDF:RDF') {
      inTag = TAG_RDF;
    }
    case TAG_RDF:
    if(node.name === 'SBOL:SEQUENCE') {
      inTag = TAG_SEQUENCE;
    }
    break;
    case TAG_SEQUENCE:
    if(node.name === 'SBOL:ELEMENTS') {
      inTag = TAG_ELEMENTS;
    }    
    break;
  }
});

parser.on('closetag', function(node) {
  switch(inTag) {
    case TAG_ELEMENTS:
    if(node === 'SBOL:ELEMENTS') {
      inTag = TAG_SEQUENCE;
    }    
    break;
    case TAG_SEQUENCE:
    if(node === 'SBOL:SEQUENCE') {
      inTag = TAG_RDF;
    }
    break;
    case TAG_RDF:
    if(node === 'RDF:RDF') {
      inTag = TAG_NONE;
    }
    break;
  }
});

parser.on('text', function(node) {
  if(inTag !== TAG_ELEMENTS) return;
  console.log("text:", node);
})


parser.on('error', function(err) {
  console.error("SBOL parsing error:", err);
});


filePath = path.join(__dirname, 'sample_data', 'test.sbol');
