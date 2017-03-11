WARNING: This code is not yet fully working. 

Stream processor that takes GenBank, FASTA or plaintext formats as input and streams out just the sequence data (DNA, RNA or Amino Acids) with all formatting and meta-data removed.

This is not a strict parser. It will successfully parse things that only have a vague resemblance to their correct formats. This parser is meant to be fast and asynchronous. If you need format validation look elsewhere.

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
  stripUnexpected: false, // strip unexpected characters
  errorOnUnexpected: true, // emit error if any unexpected chars encountered
  multi: false, // false, 'concat' or 'error', see description below
  separator: '' // the separator to use when multi is set to 'concat' 
  inputEncoding: 'utf8', // decode input using this encoding
  outputEncoding: inputEncoding, // encode output using this encoding
  maxBuffer: 50000, // never buffer more than this many bytes
  sbolConcat: true, // treat multiple sequences in an SBOL document as one sequence
  sbolCheckEncoding: false // ensure the SBOL encoding is as expected
}
```

If type is set to 'AA' and GenBank format is encountered then this will cause the parser to only look at the Amino Acid version of the sequence (GenBank allows specifying both translated and untranslated versions of the same sequence). 

If type is set to 'RNA' then all encountered 'U' characters will be converted to 'T' and vice-versa if type is set to 'DNA'. 

If `stripUnexpected` is true then any characters in the sequence that were not expected based on the type are stripped from the output, otherwise all sequence characters are kept.

If `errorOnUnexpected` the first unexpected character encountered in the sequence will result in an emitted error. 

Do keep in mind that expected characters for Amino Acid sequences include all expected characters for DNA and RNA sequences so you will receive no errors if you set `type` to 'AA' and then receive DNA or RNA sequences.

If `multi` is false then the stream will simply end at the end of the first sequence. If it is set to 'concat' then all sequences in a file will be streamed in order with the optional `options.separator` between each sequence. If `options.multi` is 'error' then an error will be emitted if more than one sequences are encountered in a file before the stream ends.

If `maxBuffer` is 0 then no limit on the buffer size is imposed.

if `sbolConcat` is true then automatically concatenate all sequences encountered in a single SBOL document. If it is false then treat them as multiple sequences and act according to the `multi` option.

If `sbolCheckEncoding` is true then the SBOL `encoding` tag will be checked to see if it matches the specified `type` and encodings other than DNA, RNA and Amino Acids will always be ignored. Unfortunately the encoding tag in the SBOL format is specified after the encoded data (see (this issue)[https://github.com/SynBioDex/SBOL-specification/issues/97]) so setting this option to true causes streaming-sequence-parser to buffer sequences in their entirety until the encoding can be identified. Setting this option to false risks accidentally outputting [SMILES](http://opensmiles.org/opensmiles.html) data (also allowed in SBOL) but only if that data consists entirely of characters allowed in DNA, RNA or Amino Acids.

# Output format

The output will consist of all nucleotide or amino acid characters encountered in the sequences, as specified by in the 'Allowed sequence characters' section.


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

To identify SBOL format the parser looks for the pattern '<rdf:RDF' (case insensitive) and then uses a streaming XML parser to find 'sbol:Elements' tags inside of 'sbol:Sequence' tags inside of the 'rdf:RDF' tag. It skips all sequence tags where the encoding does not contain the string 'www.chem.qmul.ac.uk/iubmb/misc/naseq.html' or 'www.chem.qmul.ac.uk/iupac/AminoAcid'. 

It extracts all text nodes from within all 'sbol:Elements' tags.

## FASTA

To idenfity FASTA format the parser looks for the first non-empty line that begins with either `>` or `;` and then assumes that the sequence begins at the first non-empty line after that which doesn't begin with a `;`.  

Any subsequent lines beginning with `>` are taken to mean that multiple sequences are present in the file.

## Genbank

To identify GenBank format the parser looks for the first non-empty line that begins with `LOCUS` and then assumes that the sequence begins after the first line starting with `ORIGIN` and ends either when encountering a line beginning with `//` or end of file.

Subsequent lines starting with `LOCUS` are taken to mean that multiple sequences are present in the file.

## No auto type support for amino acids

If `auto` is specified as the type (the default) then for GenBank format it will output the DNA or RNA sequence if such a sequence is present, but will not transform the character T to U since GenBank format has no simple way of specifying if a sequence is wholly DNA or RNA, and if no DNA or RNA sequence is present then it will output nothing at all.

The parser currently is not able to auto-detect if a GenBank formatted stream contains Amino Acid sequences vs. DNA/RNA sequences. This is because Amino Acid sequence appear before the field that specifies if the DNA/RNA sequence is present and because often both types of sequences are present. It would be necessary to buffer all AA sequences (specified in `translation=""` feature qualifiers) until later in the stream when it becomes known if a DNA/RNA sequence is present. For very large genbank streams (files) this would defeat the purpose of using a stream processor and even if implemented it would be necessary to make a decision about whether to output AA or DNA/RNA sequence when both are present.


## plaintext

If the first non-empty (white-space only) line encountered consists only of allowed input characters then the parser will assume that the input is in plaintext format.

One or more empty lines after a sequence with lines consisting only of allowed character following the empty line is taken to mean that the stream contains multiple sequences. That is: One or more empty lines is interpreted as a sequence delimiter.

# ToDo

* Add SBOL support (look at npm module `sax`)
* Implement opts.multi and opts.separator
* Deal with maxBuffer
* Implement GenBank AA support
* Add plaintext support
* Unit tests

# License and copyright

License: AGPLv3

Copyright 2017 The BioBricks Foundation
