
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
    convertToExpected: false, // Ts to Us if type is RNA and vice-versa for DNA
    stripUnexpected: false, // strip unexpected characters
    errorOnUnexpected: true, // emit error when encountering unexpected characters
    header: '', // the FASTA header to prepend before each sequence. can be a function
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

  var charRegex;
  if(opts.convertToExpected && (type === 'dna' || type === 'rna')) {
    // if converting between DNA and RNA then accept all nucleotides
    charRegex = charRegexes['na'];
  } else {
    charRegex = charRegexes[type];
  }

  var decoder = new Decoder(opts.inputEncoding);
  var buffer = '';
  var parser;
  var firstFastaHeader = /^\s*[>;].*\n/m;
  var fastaHeader = /^>.*\n/m;
  var fastaComment = /^;.*\n/mg;
  var fastaCommentStart = /^\s*;.*/m;
  var fastaStrip = /\s+/g;
  var fastaEnd = /\r?\n\r?\n|\n>/m;
  var fastaGotHeader;
//  var whitespaceStrip = /[ \f\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;
  var foundFastaSeq = false;
  var genbankLocus = /^\s*LOCUS/m;
  var genbankOrigin = /^\s*ORIGIN/m;
  var genbankOriginEnd = /\//m; // we're mathcing / instead of // to simplify the parser
  var genbankTranslation = /^\s*\/translation=["']/m;
  var genbankTranslationEnd = /['"]/m;
  var genbankStrip = /[\s\d]+/g; // chars that are allowed in sequence (ORIGIN) section but should be stripped from output
  var uRegex = /U+/g;
  var tRegex = /T+/g;
  var genbankFoundTranslation = false; // genbank parser state
  var genbankFoundOrigin = false; // genbank parser state
  var errorEmitted = false;
  var stream;
  var sbolStart = /<rdf:RDF/i;
  var sbolExtract;
  var sbolBufferOffset;
  var m, m2, i, str, r;
  var seqCount = 0;

  function sanitizeSequence(seq) {
    if(opts.convertToExpected) {
      if(type === 'dna') {
        seq = seq.replace(uRegex, 'T');
      } else if(type === 'rna') {
        seq = seq.replace(tRegex, 'U');
      }
    }

    if(opts.errorOnUnexpected && !errorEmitted && (m = seq.match(charRegex))) {
      stream.emit('error', new Error("Found unexpected character(s): " + m[0]));
    }
    
    if(opts.stripUnexpected) {
      return seq.replace(charRegex, '')
    }
    return seq;
  }
  
  function pushHeader(self) {
    var o;
    if(opts.header) {
      if(typeof opts.header === 'function') {
        o = opts.header(seqCount);
      }
      if(typeof o === 'object') {
        o = JSON.stringify(o);
      } else {
        i = opts.header.toString();
      }
      self.push("\n\n>"+o+"\n");
    } else {
      self.push("\n\n");
    }
    seqCount++;
  }


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
          pushHeader(self);
          buffer = buffer.slice(m.index + m[0].length);
          fastaGotHeader = true;
          foundFastaSeq = true;
          if(!parser) parser = parsers.fasta;
        } else {
          return runAgain;
        }
      }

      if(m = buffer.match(fastaEnd)) {
        // found the end of fasta so just consume until the end
        str = buffer.substr(0, m.index).toUpperCase();
        buffer = buffer.slice(m.index);
        parser = undefined;
      } else {
        // no end in sight so consume the rest of the buffer
        str = buffer;
      }

      str = str.replace(fastaComment, ''); // strip comments
      str = str.replace(fastaStrip, ''); // strip whitespace

      // if encountering the beginning of a comment
      // after stripping comments
      // that means we received a partial comment
      // so wait for more to arrive
      if(str.match(fastaCommentStart)) {
        return;
      }
      if(parser) {
        buffer = '';
      }
      
      self.push(sanitizeSequence(str));
      return runAgain;
    },

    genbank: function(self, check) {


      if(!parser) {

        genbankFoundOrigin = false;
        genbankFoundTranslation = false;
        if(m = buffer.match(genbankLocus)) {
          if(check) return m.index;

          parser = parsers.genbank;

          // throw away buffer until and including LOCUS keyword
          buffer = buffer.slice(m.index + m[0].length); 
        } else {
          return false;
        }
      }

      if(!genbankFoundOrigin && !genbankFoundTranslation) {

        if(type === 'aa' || type === 'auto') {
          m2 = buffer.match(genbankTranslation);
        } else {
          m2 = null;
        }

        m = buffer.match(genbankOrigin);
        if(!m && !m2) {
          return false;
        }
        // if an origin was found before the next translation
        if((m && !m2) || (m && (m.index < m2.index))) {
          genbankFoundOrigin = true;

          // throw away buffer until and including ORIGIN keyword
          buffer = buffer.slice(m.index + m[0].length); 
          if(type !== 'aa') {
            pushHeader(self);
          }
        } else if(m2) { // a translation was found before the next origin
          genbankFoundTranslation = true;

          // throw away buffer until and including translation="
          buffer = buffer.slice(m2.index + m2[0].length);
          pushHeader(self);
        } else {
          i = buffer.lastIndexOf("\n")
          if(i >= 0) {
            buffer = buffer.slice(i); // throw away buffer with no matches
          }
          return;
        }
      }
      
      if(genbankFoundTranslation) {
        m = buffer.match(genbankTranslationEnd);
      } else {
        m = buffer.match(genbankOriginEnd);
      }
      if(m) {
        str = buffer.substr(0, m.index).toUpperCase();
        buffer = buffer.slice(m.index + m[0].length);

        if(genbankFoundOrigin) {
          parser = undefined; // reset parser discovery since we're at the end

          // found end of origin but we're not outputting it in AA mode
          if(type === 'aa') {
            return;
          }
        } else {
          genbankFoundTranslation = false;
        }
      } else {
        str = buffer.toUpperCase();
        buffer = '';
      }

      // strip whitespace and nucletide counts
      str = str.replace(genbankStrip, '');

      self.push(sanitizeSequence(str));
      return;
    },

    sbol: function(self, check) {
      // check for <rdf:RDF> for begin
      // then initialize 

      if(!parser) {
        m = buffer.match(sbolStart);
        if(!m) return;
        if(check) return m.index;

        parser = parsers.sbol;
        sbolBufferOffset = 0;

        sbolExtract = sbolExtractor(opts, function(err, consumed, seq) {
          if(err) {
            cb(err);
            return;
          }

          if(consumed) {
            buffer = buffer.substr(consumed - sbolBufferOffset);
            sbolBufferOffset = consumed;
          }

          // end of SBOL data
          if(seq === null) {
            parser = undefined;
            return;
          }

          if(!seq) return;
          pushHeader(self);

          seq = seq.toUpperCase();

          self.push(sanitizeSequence(seq));
        });
      }

      sbolExtract.write(buffer);
      return false;
    }
  }
    

  
  var key, parts, nextIndex, nextKey, prevLen, nextNewline;
  function parse(self, data, enc, cb, ending) {
    if(data) {
      buffer += decoder.write(data);
    }

    if(!ending) {
      // we need two bytes, and one byte after the last newline if any
      // in order to match FASTA and GenBank end patterns (double-newline or "\n>")
      if(buffer.length < 2) {
        return cb();
      }
      
      nextNewline = buffer.indexOf("\n");
      if(nextNewline >= 0 && (buffer.length - nextNewline - 1 < 1)) {
        return cb();
      }
    }

    do {
      prevLen = buffer.length;
      if(parser) {
        parser(self, false, ending);
      } else {
        nextIndex = Infinity;
        for(key in parsers) {
          i = parsers[key](self, true, ending);
          if((typeof i === 'number') && i < nextIndex) {
            
            nextIndex = i;
            nextKey = key;
          }
        }
        if(nextIndex < Infinity) {
          parsers[nextKey](self, false, ending);
        } else {
          break;
        }
      }

      // continue processing current buffer
      // as long as there is buffer to process
      // and as long as each iteration actually consumes part of the buffer
    } while(buffer.length && (prevLen !== buffer.length));
    cb()
  }


  stream = through(function(data, enc, cb) {
    parse(this, data, enc, cb);
  }, function(cb) {
    // process the last few bytes (if any)
    parse(this, null, null, cb, true);
  });

  stream.setEncoding(opts.outputEncoding);
  return stream;

}


module.exports = sse;
