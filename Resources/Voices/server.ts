'use strict';
const VoiceText = require('voicetext')
const fs = require('fs')

const voice = new VoiceText('3xmx4v5t04hum24n')
voice.speaker(voice.SPEAKER.HIKARI)
    .emotion(voice.EMOTION.HAPPINESS) // NONE, HAPPINESS, ANGER, SADNESS
    .speak('そろそろお昼ご飯の時間だね．しっかり食べて栄養補給しようね！', (e, buf) => {fs.writeFile('./lunch.wav', buf, 'binary', (e) => {console.error(e)})
})
