var sax = require('sax');

function sbolExtractor(opts, cb) {

  var parser = sax.parser(false, {trim: false});

  var TAG_NONE = 0;
  var TAG_RDF = 1;
  var TAG_SEQUENCE = 2;
  var TAG_ELEMENTS = 3;

  var inTag = TAG_NONE;

  /*
    on every opentag and closetag and text event:
    tell the callback that it's ok to throw away 
    everything up until that point 
    (parser.position has length of parsed chars)
    then on close <rdf:RDF> our buffer will have the rest.
  */

  parser.onopentag = function(node) {
//    console.log("OPEN", node);
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
    cb(null, parser.position); 
  };

  parser.onclosetag = function(node) {

//    console.log("CLOSE", node);
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
        return cb(null, parser.position, null);
      }
      break;
    }
    cb(null, parser.position);
  };

  parser.ontext = function(node) {
    if(inTag !== TAG_ELEMENTS) return;

    node = node.trim();
    if(!node) return;
    cb(null, null, node);
  };

  parser.onend = function(err) {
//    console.log("<ended>");
  };

  parser.onerror = function(err) {
//    console.error("!!!!!!!!!!!SBOL parsing error:", err.message);
    // ignore errors
    this.error = null;
    this.resume();
  };


  return parser;
}


module.exports = sbolExtractor;
