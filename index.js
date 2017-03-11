
var Decoder = require('string_decoder').StringDecoder;
var through = require('through2');
var xtend = require('xtend');


function sse(type, opts) {
  if(typeof type === 'object') {
    opts = type;
    type = undefined;
  }
  opts = xtend({    
    stripUnexpected: false, // strip unexpected characters
    errorOnUnexpected: true, // emit error when encountering unexpected characters
    multi: false, // false, 'concat' or 'error', see README.md
    separator: '', // the separator to use when multi is set to 'concat' 
    inputEncoding: 'utf8', // decode input using this encoding
    outputEncoding: undefined, // encode output using this encoding
    dnaChars: 'TGACRYMKSWHBVDN\\-',
    rnaChars: 'UGACRYMKSWHBVDN\\-',
    aaChars: 'ABCDEFGHIKLMNPQRSTUVWYZX*\\-',
    maxBuffer: 50000 // fail if no valid parser identified after 50 kilo-chars
  }, opts);
  opts.outputEncoding = opts.outputEncoding || opts.inputEncoding;
  type = type ? type.toLowerCase() : 'auto';

  var charRegexes = {
    dna: new RegExp('[^'+opts.dnaChars+']+', 'g'),
    rna: new RegExp('[^'+opts.rnaChars+']+', 'g'),
    aa: new RegExp('[^'+opts.aaChars+']+', 'g'),
    na: new RegExp('[^'+opts.dnaChars+opts.rnaChars+']+', 'g'),
    auto: new RegExp('[^'+opts.dnaChars+opts.rnaChars+opts.aaChars+']+', 'g')
  };

//  var mostWhitespace = ' \f\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'; // this is the same as \s but without matching \n and \r

  var charRegex = charRegexes[type];

  var decoder = new Decoder(opts.inputEncoding);
  var buffer = '';
  var parser;
  var firstFastaHeader = /^[>;].*\n/m;
  var fastaHeader = /^>.*\n/m;
  var fastaComment = /^;.*\n/mg;
  var fastaStrip = /\s+/g;
  var foundFastaSeq = false;
  var genbankLocus = /^LOCUS/m;
  var genbankOrigin = /^ORIGIN/m;
  var genbankStrip = /[\s\d]+/g; // chars that are allowed in sequence (ORIGIN) section but should be stripped from output
  var genbankEnd = '//';
  var uRegex = /U+/g;
  var tRegex = /T+/g;
  var genbankFoundOrigin = false;
  var errorEmitted = false;
  var stream;
  var m, i, str, r;

  var parsers = {

    fasta: function(cb) {
      // fasta doesn't need newlines between multiple seqs

      if(!parser) {
        if(foundFastaSeq) {
          r = fastaHeader;
        } else {
          // only the first fasta header in a file
          // is allowed to start with either > or ;
          // all subsequent headers must start with >
          r = firstFastaHeader; 
        }
        foundFastaSeq = true;
        if(m = buffer.match(r)) {
          parser = parsers.fasta;
          // throw away header part of buffer
          buffer = buffer.slice(m.index + m); 
        } else {
          // we can't throw any buffer away because we don't know if we're the right parser yet
          return;
        }
      }

      if(m = buffer.match(fastaHeader)) {
        str = buffer.substr(0, m.index).toUpperCase();
        buffer = buffer.slice(m.index + m[0].length);
      } else {
        str = buffer.toUpperCase();
        buffer = '';
      }

      str = str.replace(fastaComment, ''); // strip comments
      str = str.replace(fastaStrip, ''); // strip whitespace (but not newlines)

      if(opts.errorOnUnexpected && !errorEmitted && (m = str.match(charRegex))) {
        stream.emit('error', new Error("Found unexpected character(s): " + m[0]));
      }

      if(type === 'dna') {
        str = str.replace(uRegex, 'T');
      } else if(type === 'rna') {
        str = str.replace(tRegex, 'U');
      }
      
      if(opts.stripUnexpected) {
        return cb(null, str.replace(charRegex, ''));
      }
      
      return cb(null, str);
    },

    genbank: function(cb) {

      if(!parser) {
        if(m = buffer.match(genbankLocus)) {
          parser = parsers.genbank;

          // throw away buffer until and including LOCUS keyword
          buffer = buffer.slice(m.index + m[0].length); 
        } else {
          return;
        }
      }

      if(!genbankFoundOrigin) {
        if(m = buffer.match(genbankOrigin)) {
          // TODO implement AA matching for GenBank
          if(type === 'aa') throw new Error("Amino Acid matching for GenBank format not implemented");

          genbankFoundOrigin = true;
          // throw away buffer until and including ORIGIN keyword
          buffer = buffer.slice(m.index + m[0].length); 
        } else {
          i = buffer.lastIndexOf("\n")
          if(i >= 0) {
            buffer = buffer.slice(i); // throw away buffer with not matches
          }
          return;
        }
      }

      i = buffer.indexOf(genbankEnd);
      if(i >= 0) {
        str = buffer.substr(0, i).toUpperCase();
        buffer = buffer.slice(i + genbankEnd.length);
        parser = undefined; // reset parser discovery since we're at the end
      } else {
        str = buffer.toUpperCase();
        buffer = '';
      }

      // strip whitespace and nucletide counts
      str = str.replace(genbankStrip, '');

      if(opts.errorOnUnexpected && !errorEmitted && (m = str.match(charRegex))) {
        stream.emit('error', new Error("Found unexpected character(s): " + m[0]));
      }

      if(type === 'dna') {
        str = str.replace(uRegex, 'T');
      } else if(type === 'rna') {
        str = str.replace(tRegex, 'U');
      }
      
      if(opts.stripUnexpected) {
        return cb(null, str.replace(charRegex, ''));
      }
      
      return cb(null, str);
    },

    plaintext: function(cb) {

    }, 

    sbol: function(cb) {

    }

  }
    
  var key, parts;
  stream = through(function(data, enc, cb) {
    buffer += decoder.write(data);
    
    if(parser) return parser(cb);

    for(key in parsers) {
      parsers[key](cb);
      if(parser) break
    }    
  });

  stream.setEncoding(opts.outputEncoding);
  return stream;

}


module.exports = sse;
