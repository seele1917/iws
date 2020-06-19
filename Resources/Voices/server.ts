'use strict';
const VoiceText = require('voicetext')
const player = require('play-sound')();
const fs = require('fs')

const voice = new VoiceText('3xmx4v5t04hum24n')
voice.speaker(voice.SPEAKER.HIKARI)
    .emotion(voice.EMOTION.HAPPINESS) // NONE, HAPPINESS, ANGER, SADNESS
    .speak('何してるの?', (e, buf) => {fs.writeFile('./happy2.wav', buf, 'binary', (e) => {console.error(e)})
})
