'use strict';
const VoiceText = require('voicetext')
const player = require('play-sound')();
const fs = require('fs')

const voice = new VoiceText('3xmx4v5t04hum24n')
voice.speaker(voice.SPEAKER.HIKARI)
    .emotion(voice.EMOTION.HAPPINESS) // NONE, HAPPINESS, ANGER, SADNESS
    .speak('「Yes we きゃん」　君ならできる！', (e, buf) => {fs.writeFile('./YesWeCan.wav', buf, 'binary', (e) => {console.error(e)})
})