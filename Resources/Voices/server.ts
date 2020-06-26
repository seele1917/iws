'use strict';
const VoiceText = require('voicetext')
const player = require('play-sound')();
const fs = require('fs')

const voice = new VoiceText('3xmx4v5t04hum24n')
voice.speaker(voice.SPEAKER.HIKARI)
    .emotion(voice.EMOTION.NONE) // NONE, HAPPINESS, ANGER, SADNESS
    .speak('OK Google.  はい，勤務開始！', (e, buf) => {fs.writeFile('./okgoogle2.wav', buf, 'binary', (e) => {console.error(e)})
})
