const ffmpeg = require('fluent-ffmpeg');
const VAD = require('node-vad');
const fs = require('fs');

const INPUT = './input.mp4';

const inputStream = ffmpeg(fs.createReadStream(INPUT))
  .noVideo()
  .audioCodec('pcm_s16be')
  .audioFrequency(16000)
  .audioChannels(1)
  .format('s16be')
  .pipe();
const vadStream = VAD.createStream({
  // mode: VAD.Mode.VERY_AGGRESSIVE,
  mode: VAD.Mode.NORMAL,
  audioFrequency: 16000,
  debounceTime: 1000,
});

let lastBlock;
inputStream.pipe(vadStream).on('data', data => {
  if (data.speech.end) {
    console.log(`${data.speech.startTime / 1000} -> ${data.time / 1000}`);
  }
  lastBlock = data;
});
if (lastBlock && lastBlock.speech.state) {
  console.log(
    `${lastBlock.speech.startTime / 1000} -> ${lastBlock.time / 1000}`
  );
}
