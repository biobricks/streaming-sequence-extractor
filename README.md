
Stream processor that takes GenBank, FASTA or plain-text formats as input and streams out just the sequence data (DNA, RNA or Amino Acids) with all formatting and meta-data removed.

This is not a strict parser. It will successfully parse things that only have a vague resemblance to their correct formats. This parser is meant to be fast and asynchronous. If you need format validation look elsewhere.

# Usage

```
var tse = require('streaming-sequence-extractor');

var seqStream = tse();

fs.createReadStream('myseq.gb').pipe(seqStream);

seqStream.on('data', function(data) {
  console.log(data);
});

seqStream.on('end', function(data) {
  console.log("stream ended");
});
```

# API

## tse([type], [options])

type can be:

* 'DNA': Expect only DNA sequences
* 'RNA': Expect only RNA sequences
* 'NA': Expect DNA or RNA sequences
* 'AA': Expect only Amino Acid sequences
* 'auto': (default) Expect DNA, RNA or AA sequences (but see the 'No auto type...' section)

options (with defaults specified);

```
{
  strict: true, // if true, strip non-sequence characters from output
  multi: false, // false, 'concat' or 'error', see description below
  separator: '' // the separator to use when multi is set to 'concat' 
}
```

If type is set to 'RNA' then all encountered `U` characters will be converted to `T` and vice-versa if type is set to 'DNA'.

If `options.multi` is false then the stream will simply end at the end of the first sequence. If it is set to 'concat' then all sequences in a file will be streamed in order with the optional `options.separator` between each sequence. If `options.multi` is 'error' then an error will be emitted if more than one sequences are encountered in a file before the stream ends.

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

## FASTA

To idenfity FASTA format the parser looks for the first non-empty line that begins with either `>` or `;` and then assumes that the sequence begins at the first non-empty line after that which doesn't begin with a `;`.  

Any subsequent lines beginning with `>` are taken to mean that multiple sequences are present in the file.

## Genbank

To identify GenBank format the parser looks for the first non-empty line that begins with `LOCUS` and then assumes that the sequence begins after the first line starting with `ORIGIN` and ends either when encountering a line beginning with `//` or end of file.

Subsequent lines starting with `LOCUS` are taken to mean that multiple sequences are present in the file.

## No auto type support for amino acids

If `auto` is specified as the type (the default) then for GenBank format it will output the DNA or RNA sequence if such a sequence is present, but will not transform the character T to U since GenBank format has no simple way of specifying if a sequence is wholly DNA or RNA, and if no DNA or RNA sequence is present then it will output nothing at all.

The parser currently is not able to auto-detect if a GenBank formatted stream contains Amino Acid sequences vs. DNA/RNA sequences. This is because Amino Acid sequence appear before the field that specifies if the DNA/RNA sequence is present and because often both types of sequences are present. It would be necessary to buffer all AA sequences (specified in `translation=""` feature qualifiers) until later in the stream when it becomes known if a DNA/RNA sequence is present. For very large genbank streams (files) this would defeat the purpose of using a stream processor and even if implemented it would be necessary to make a decision about whether to output AA or DNA/RNA sequence when both are present.

# ToDo

* Add SBOL support
* Unit tests

# License and copyright

License: AGPLv3

Copyright 2017 The BioBricks Foundation
