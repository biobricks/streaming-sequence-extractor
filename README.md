[![NPM][npm-img]][npm-url]
[![Build Status][ci-img]][ci-url]

Stream processor that takes GenBank, FASTA or SBOL 2.x formats as input and streams out just the sequence data (DNA, RNA or Amino Acid sequences) with all formatting and meta-data removed. 

Optionally you can specify a FASTA header to be appended to each sequence.

This module was written to facilitate the building of BLAST databases from large amounts of user-contributed sequence files, while using the appended FASTA header to reference the BLAST query results back to the original file.

This is not a strict parser. It will successfully parse things that only bear a vague resemblance to their correct formats. This parser is meant to be fast, asynchronous and platform-independent. If you need strict format validation look elsewhere.

# Usage

```
var sse = require('streaming-sequence-extractor');
var fs = require('fs');

var seqStream = sse();

fs.createReadStream('myseq.gb').pipe(seqStream);

seqStream.on('data', function(data) {
  console.log(data);
});

seqStream.on('end', function(data) {
  console.log("stream ended");
});
```

# API

## see([type], [options])

type can be:

* 'DNA': Expect only DNA sequences
* 'RNA': Expect only RNA sequences
* 'NA': Expect DNA and RNA sequences
* 'AA': Expect only Amino Acid sequences
* 'auto': (default) Expect DNA, RNA and AA sequences (but see the 'No auto type...' section)

options (with defaults specified);

```
{
  convertToExpected: false, // convert between T and U based on type 'DNA' or 'RNA'
  stripUnexpected: false, // strip unexpected characters
  errorOnUnexpected: true, // emit error if any unexpected chars encountered
  header: '' // the FASTA header to prepend before each sequence. can be a function
  inputEncoding: 'utf8', // decode input using this encoding
  outputEncoding: inputEncoding // encode output using this encoding
}
```

If type is set to 'AA' and GenBank format is encountered then this will cause the parser to only look at the Amino Acid version of the sequence (GenBank allows specifying both translated and untranslated versions of the same sequence). 

If `convertToUnexpected` is true then if type is set to 'RNA' then all encountered 'U' characters will be converted to 'T' and vice-versa if type is set to 'DNA'. 

If `stripUnexpected` is true then any characters in the sequence that were not expected based on the type are stripped from the output, otherwise all sequence characters are kept.

If `errorOnUnexpected` is true then the first unexpected character encountered in the sequence will result in an emitted error. 

Do keep in mind that expected characters for Amino Acid sequences include all expected characters for DNA and RNA sequences so you will receive no errors if you set `errorsOnUnexpected` to true and type to 'AA' and then receive DNA or RNA sequences.

If `header` is set then each sequence will be output with a FASTA header in the `>header` style. If `header` is a non-empty string then that string will be used directly as the header for all sequences. If it is an object then it will be converted to JSON first. If it is a function then the function will be passed the sequence count (number of sequences since the stream was initialized, starting from 0) as the argument and is expected to synchronously return a string or sequence.

# Output format

The output will consist of all nucleotide or amino acid characters encountered in the sequences, as specified by in the 'Allowed sequence characters' section with the optional FASTA header.

# Allowed input sequence characters

Allowed input characters for DNA are the IUPAC characters [as per the GenBank Submissions Handbook](https://www.ncbi.nlm.nih.gov/books/NBK53702/#gbankquickstart.if_i_don_t_know_the_base) plus the extra characters [allowed by BLAST](https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Web&PAGE_TYPE=BlastDocs&DOC_TYPE=BlastHelp):

```
TGACRYMKSWHBVDN-
```

and for RNA:

```
UGACRYMKSWHBVDN-
```

and for Amino Acids:

```
ABCDEFGHIKLMNPQRSTUVWYZX*-
```

This parser additionally allows lower case versions of the allowed characters.

# Formats

## SBOL

To identify SBOL format the parser looks for the pattern '<?xml' or '<rdf:RDF' (case insensitive) and then uses a streaming XML parser to find 'sbol:Elements' tags inside of 'sbol:Sequence' tags inside of the 'rdf:RDF' tag. It currently does not check the encoding.

It extracts all text nodes from within all 'sbol:Elements' tags.

This parser has only works with SBOL 2. It is currently not backwards compatible with SBOL 1.

## FASTA

To idenfity FASTA format the parser looks for the first non-empty line that begins with either `>` or `;` and then assumes that the sequence begins at the first non-empty line after that which doesn't begin with a `;`.  

Any subsequent lines beginning with `>` are taken to mean that multiple sequences are present in the file.

## Genbank

To identify GenBank format the parser looks for the first non-empty line that begins with `LOCUS` and then assumes that the sequence begins after the first line starting with `ORIGIN` and ends either when encountering a line beginning with `//` or end of file.

Subsequent lines starting with `LOCUS` are taken to mean that multiple sequences are present in the file.

## No auto type support for amino acids

If `auto` is specified as the type (the default) then for GenBank format it will output the DNA or RNA sequence if such a sequence is present, but will not transform the character T to U since GenBank format has no simple way of specifying if a sequence is wholly DNA or RNA, and if no DNA or RNA sequence is present then it will output nothing at all.

## Gotchas

The parser currently is not able to auto-detect if an SBOL formatted stream contains Amino Acid sequences vs. DNA/RNA sequences.

The input stream is supposed to be able to contain a mix of the supported formats concatenated together. E.g. you should be able to stream a FASTA file followed by an SBOL file and then a GenBank file, as long as each FASTA or FASTQ file ends with a double-newline.

However, currently the SBOL parser overconsumes in some cases (see examples/multi_fail.js) which can cause it to eat up the beginning of the next format. This is an issue with the sax npm module not stopping when it reaches the closing tag of the root node (which is fair if it was designed for parsing a single xml file per initialization).

# ToDo

* Support FASTQ format
* Fix SBOL overconsumption so we can support mixed-format streams.
* Implement checking of SBOL encoding so we can discard SMILE data.
* Implement opts.maxBuffer (maximum buffer size)
* More unit tests

# Tests

The tests called `*.nobrake.js` are piping input into streaming-sequence-extractor as fast as possible, which usually means that it is received as a single large chunk, a at the most as a few large chunks. The other tests are using the [brake](https://www.npmjs.com/package/brake) module to throttle the input rate such that failures associated with receiving the stream in small (usually single character) increments can be discovered.

# License and copyright

License: AGPLv3

Copyright 2017 The BioBricks Foundation

[ci-img]: https://travis-ci.org/biobricks/streaming-sequence-extractor.svg?branch=master
[ci-url]: https://travis-ci.org/biobricks/streaming-sequence-extractor
[npm-img]: https://nodei.co/npm/streaming-sequence-extractor.png
[npm-url]: https://nodei.co/npm/streaming-sequence-extractor/