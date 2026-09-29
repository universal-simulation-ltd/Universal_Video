import type { Source } from './types'

// The research, standards and reports behind each article, keyed by article
// id. The same in every language, so kept once here and attached by index.ts.
//
// Original research papers first, then the standards, then guidance — and
// only sources for what the app really does (checked against src/ and
// @unisim/media 0.6.0 on 2026-09-29): decoding and encoding are the
// browser's WebCodecs (VideoDecoder/VideoEncoder for H.264 High profile,
// avc1.64xxxx, and AudioEncoder for AAC-LC, mp4a.40.2); the MP4 around them
// is @unisim/media's own ISO base media file format reader and muxer (ftyp
// isom/mp42/avc1, stsd > avc1 > avcC and mp4a > esds); the bitrate is worked
// out from frame size and frame rate; the memory plan reads
// navigator.deviceMemory; separate files are a STORED (uncompressed) ZIP,
// streamed to disk through showSaveFilePicker where the browser has it;
// recent files live in IndexedDB. No ffmpeg or wasm, and nothing reads MKV or
// WebM, so Matroska is deliberately not cited here.
//
// ⚠️ `pdf` (our hosted copy at opensource.unisim.co.uk/kb/papers/) ONLY where
// the licence allows redistribution. Nothing here qualifies: the IEEE papers
// link to their DOI, ITU-T/ITU-R Recommendations are free to download but
// not to redistribute, and ISO/IEC 14496-12 is a paid standard. iso.org
// bot-blocks curl, so its page was confirmed through the Wayback Machine's
// 2026-09-28 capture.

const ISO_BMFF: Source = {
  kind: 'standard',
  title: 'ISO/IEC 14496-12:2022 — Coding of audio-visual objects — Part 12: ISO base media file format',
  publisher: 'ISO/IEC',
  year: 2022,
  href: 'https://www.iso.org/standard/83102.html',
}

const H264: Source = {
  kind: 'standard',
  title: 'Recommendation ITU-T H.264: Advanced video coding for generic audiovisual services',
  publisher: 'ITU-T',
  href: 'https://www.itu.int/rec/T-REC-H.264',
}

const H264_OVERVIEW: Source = {
  kind: 'paper',
  title: 'Overview of the H.264/AVC Video Coding Standard',
  authors: 'Thomas Wiegand, Gary J. Sullivan, Gisle Bjøntegaard, Ajay Luthra',
  publisher: 'IEEE Transactions on Circuits and Systems for Video Technology',
  year: 2003,
  href: 'https://doi.org/10.1109/TCSVT.2003.815165',
}

const BT709: Source = {
  kind: 'standard',
  title: 'Recommendation ITU-R BT.709-6: Parameter values for the HDTV standards for production and international programme exchange',
  publisher: 'ITU-R',
  year: 2015,
  href: 'https://www.itu.int/rec/R-REC-BT.709',
}

const WEBCODECS: Source = {
  kind: 'standard',
  title: 'WebCodecs',
  publisher: 'W3C',
  href: 'https://www.w3.org/TR/webcodecs/',
}

const FILE_SYSTEM_ACCESS: Source = {
  kind: 'standard',
  title: 'File System Access (showSaveFilePicker)',
  publisher: 'W3C Web Incubator Community Group',
  href: 'https://wicg.github.io/file-system-access/',
}

const LOCAL_FIRST: Source = {
  kind: 'paper',
  title: 'Local-first software: You own your data, in spite of the cloud',
  authors: 'Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, Mark McGranaghan',
  publisher: 'ACM Onward!',
  year: 2019,
  href: 'https://www.inkandswitch.com/local-first/static/local-first.pdf',
}

export const SOURCES: Record<string, Source[]> = {
  'containers-and-codecs': [
    ISO_BMFF,
    H264,
    H264_OVERVIEW,
  ],
  'resolution-bitrate-frame-rate': [
    BT709,
    {
      kind: 'standard',
      title: 'Recommendation ITU-R BT.2020-2: Parameter values for ultra-high definition television systems for production and international programme exchange',
      publisher: 'ITU-R',
      year: 2015,
      href: 'https://www.itu.int/rec/R-REC-BT.2020',
    },
    { ...H264, title: 'Recommendation ITU-T H.264: Advanced video coding, Annex A: profiles and levels' },
  ],
  'why-video-files-are-big': [
    {
      kind: 'paper',
      title: 'Discrete Cosine Transform',
      authors: 'Nasir Ahmed, T. Natarajan, K. R. Rao',
      publisher: 'IEEE Transactions on Computers',
      year: 1974,
      href: 'https://doi.org/10.1109/T-C.1974.223784',
    },
    {
      kind: 'paper',
      title: 'Displacement Measurement and Its Application in Interframe Image Coding',
      authors: 'Jaswant R. Jain, Anil K. Jain',
      publisher: 'IEEE Transactions on Communications',
      year: 1981,
      href: 'https://doi.org/10.1109/TCOM.1981.1094950',
    },
    H264_OVERVIEW,
  ],
  'where-the-work-happens': [
    WEBCODECS,
    ISO_BMFF,
    LOCAL_FIRST,
  ],
  'export-settings': [
    H264,
    BT709,
    {
      kind: 'standard',
      title: 'APPNOTE.TXT — .ZIP File Format Specification',
      publisher: 'PKWARE',
      href: 'https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT',
    },
    FILE_SYSTEM_ACCESS,
  ],
  'big-files': [
    {
      kind: 'standard',
      title: 'Device Memory API',
      publisher: 'W3C',
      href: 'https://www.w3.org/TR/device-memory/',
    },
    { ...WEBCODECS, title: 'WebCodecs — memory model and resource reclamation' },
    FILE_SYSTEM_ACCESS,
  ],
  'what-leaves-your-device': [
    LOCAL_FIRST,
    {
      kind: 'standard',
      title: 'Indexed Database API 3.0',
      publisher: 'W3C',
      href: 'https://www.w3.org/TR/IndexedDB/',
    },
    {
      kind: 'guidance',
      title: 'Principle (c): Data minimisation',
      publisher: 'Information Commissioner\'s Office',
      href: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/',
    },
  ],
}
