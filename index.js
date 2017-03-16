
var Decoder = require('string_decoder').StringDecoder;
var through = require('through2');
var xtend = require('xtend');
var sbolExtractor = require('./lib/sbol.js');


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
  var firstFastaHeader = /^\s*[>;].*\n/m;
  var fastaHeader = /^\s*>.*\n/m;
  var fastaComment = /^;.*\n/mg;
  var fastaStrip = /\s+/g;
  var fastaEnd = /\r?\n\r?\n|\r?\n>|^LOCUS|<\?xml|<rdf:RDF/m;
  var fastaGotHeader;
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
  var sbolStart = /<rdf:RDF/i;
  var sbolExtract;
  var sbolBufferOffset;
  var m, i, str, r;

  var parsers = {

    fasta: function(self, check) {
      var runAgain = false;

      if(!parser) {
        fastaGotHeader = false;
      }

      if(!fastaGotHeader) {

        // Only the very first fasta seq in a file 
        // is allowed to have its header begin with ';'
        // All subsequent headers must begin with '>'
        if(foundFastaSeq) {
          r = fastaHeader;
        } else {
          r = firstFastaHeader;
        }

        if(m = buffer.match(r)) {
          if(check) return m.index;
          console.log("\n\n");
 //         console.log("--- consumed header:", buffer.substr(0, m.index + m[0].length), '!!!!!!!!!!!!!!!!!');
          buffer = buffer.slice(m.index + m[0].length);
          fastaGotHeader = true;
          foundFastaSeq = true;
          if(!parser) parser = parsers.fasta;
        } else {
//          console.log("--- no header match on:", buffer);
          return runAgain;
        }
      }

      if(m = buffer.match(fastaEnd)) {
        // found the end of fasta so just consume until the end
        str = buffer.substr(0, m.index).toUpperCase();
//        console.log("END AT:", buffer.substr(m.index, 20), '!!');
//        console.log("X CONSUMED:", str, '//');
        buffer = buffer.slice(m.index);
        parser = undefined;
        runAgain = true; // there could be more fasta sequences
      } else {
        // no end in sight so consume the rest of the buffer
        str = buffer;
        buffer = '';
//        console.log(". CONSUMED:", str, '//');
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
        self.push(str.replace(charRegex, ''));
        console.log("--- return unexp");
        return runAgain;
      }
      
      self.push(str);
//      console.log("--- return", runAgain);
      return runAgain;
    },

    genbank: function(self, check) {
      var runAgain = false;

      if(!parser) {
        genbankFoundOrigin = false;
        if(m = buffer.match(genbankLocus)) {
          if(check) return m.index;
          console.log("\n\n");
          parser = parsers.genbank;

          // throw away buffer until and including LOCUS keyword
          buffer = buffer.slice(m.index + m[0].length); 
        } else {
          return false;
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
            buffer = buffer.slice(i); // throw away buffer with no matches
          }
          return false;
        }
      }

      i = buffer.indexOf(genbankEnd);
      if(i >= 0) {
        str = buffer.substr(0, i).toUpperCase();
        buffer = buffer.slice(i + genbankEnd.length);
        parser = undefined; // reset parser discovery since we're at the end
        runAgain = true;
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
        self.push(str.replace(charRegex, ''))
        return runAgain;
      }
      
      self.push(str);
      return runAgain;
    },

    sbol: function(self, check) {
      // check for <rdf:RDF> for begin
      // then initialize 

      if(!parser) {
//        console.log("checking:", buffer.toString().substr(0, 10));
        m = buffer.match(sbolStart);
        if(!m) return false;
        if(check) return m.index;

        parser = parsers.sbol;
        sbolBufferOffset = 0;
//        console.log("------- FOUND RDF");

        sbolExtract = sbolExtractor(opts, function(err, consumed, seq) {
          if(err) {
            cb(err);
            return false
          }

          if(consumed) {
//            console.log("CONSUMED", buffer.substr(0, consumed - sbolBufferOffset), '---');
            buffer = buffer.substr(consumed - sbolBufferOffset);
//            console.log("buffer:", buffer.substr(0, 10), '!!!');
            sbolBufferOffset = consumed;
          }
          // end of SBOL data
          if(seq === null) {
//            console.log("END SBOL");
            parser = undefined;
            return true;
          }

          if(!seq) return false;
          console.log("\n\n");          
          self.push(seq);


        });
      }

      sbolExtract.write(buffer);
      return false;
    }
  }
    

  
  var key, parts, tryAgain, nextIndex, nextKey;
  stream = through(function(data, enc, cb) {
    buffer += decoder.write(data);    

    do {
      if(parser) {
//        console.log("parsing using:", parser === parsers.sbol, parser === parsers.fasta, parser === parsers.genbank);
        tryAgain = parser(this);
      } else {
        nextIndex = Infinity;
//        console.log('|||',buffer.substr(0, 20));
        for(key in parsers) {
//          console.log("Checking:", key);
          i = parsers[key](this, true);
          if((typeof i === 'number') && i < nextIndex) {
//            console.log("GOT", key);
            nextIndex = i;
            nextKey = key;
          }
        }
        if(nextIndex < Infinity) {
//          console.log("FOUND", nextKey);
          tryAgain = parsers[nextKey](this);
        } else {
          break;
        }
      }
//      console.log('..........', tryAgain, !!parser, key)
    } while(tryAgain);
    cb()
  });

  stream.setEncoding(opts.outputEncoding);
  return stream;

}


module.exports = sse;
