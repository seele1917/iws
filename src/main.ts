'use strict'

const Peer = require('skyway-js')
const $ = require('jquery')
import "bootstrap";
import * as faceapi from 'face-api.js'
import { Chart } from 'chart.js'
import 'chartjs-plugin-colorschemes'
import { LAppDelegate } from './modules/CubismHelper/lappdelegate'
import { LAppLive2DManager } from './modules/CubismHelper/lapplive2dmanager'

let isStart = false;
let roomName = null;
let myName = null;
let peer = null;
let room = null;
let audioContext = null;
let audioSource = null;
let avator = null;
const dataNum = 100;
const allChart = {};
let lastSpeakTime = null;

// 直前の感情
// const exAveEmotion = {emotion: null, score: 0}

// ブラウザロード時の処理
$(async () => {
    const API_KEY = '7b6a668d-c2e9-4f78-8a25-c4ad99458d99'
    initModal()
    initFaceApi()
    await initPeer(API_KEY);
    avator = initLive2d()
    lipSync()

    appendRemoteTemplate("me")
    initChart("me")
});

// ブラウザ終了時の処理
window.onbeforeunload = () => {
    audioSource.disconnect();
    audioContext.disconnect();
    audioContext.close();
    // LAppDelegate.getInstance().release();
}

function initModal() {
    // モーダルの起動
    $('#my-modal').modal({backdrop: 'static'})

    // モーダル中のスタートボタンをクリックしたときのイベント
    $("#start-button").click(() => {
        if ($("#my-form").get(0).checkValidity()){
            $("#my-modal").modal('hide')
            roomName = $('input[name="room"]').val()
            myName = $('input[name="name"]').val()
            initRoom()
            updateName("me", myName)
            speechText("start")
            isStart = true
        }
    })
}

// faceapiの初期化＋感情推定
async function initFaceApi() {
    const $video = $("<video>").get(0)
    await navigator.mediaDevices.getUserMedia({video: true})
    .then(function (stream) {
        // Success
        $video.muted = true;
        $video.playsInline = true;
        $video.srcObject = stream;
    }).catch(function (error) {
        console.error('mediaDevice.getUserMedia() error:', error);
        return;
    });

    $video.play().then(async () => {
        await faceapi.nets.tinyFaceDetector.load('Resources/Weights')
        await faceapi.loadFaceExpressionModel('Resources/Weights')
        const option = await new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
        const loop = async () => {
            const result = await faceapi.detectSingleFace($video, option).withFaceExpressions()
            updateMainLoop(result)
            setTimeout(() => loop(), 100)
        }
        loop()
    })
}
// Peerの初期設定
function initPeer(API_KEY) {
    peer = new Peer({
        key: API_KEY,
        debug: 3
    })
    peer.on('open', () => {
        console.log(peer.id)
    })

    peer.on('connection', dataConnection => {
        const peerId = dataConnection.remoteId
        dataConnection.on('data', data => {
            // console.log("receive"+ data)
            receiveData(peerId, data)
        });
        dataConnection.on('open', () => {
            dataConnection.send(myName)
        }) 
        
        appendRemoteTemplate(peerId)
        initChart(peerId)
    });
}

// Roomの初期設定
function initRoom() {
    if (!peer.open) {
        return;
    }

    room = peer.joinRoom(roomName, {
        mode: 'sfu',
    })

    room.once('open', () => {
        console.log(`join: ${room.name}`)
    })

    room.on('peerJoin', peerId => {
        console.log(`=== ${peerId} joined ===`)
        const dataConnection = peer.connect(peerId, {serialization: "json"});
        dataConnection.on('data', data => {
            // console.log("receive: "+ data)
            receiveData(peerId, data)
        });
        dataConnection.on('open', () => {
            dataConnection.send(myName)
        }) 
        appendRemoteTemplate(peerId)
        initChart(peerId)
    });

    room.on('peerLeave', peerId => {
        $(`.remote-info[data-peer-id='${peerId}']`).remove()
        delete peer.connections[`${peerId}`]
        delete allChart[peerId]
    });

    // roomへの全体データ送信: skywayでは100msごとしかデータを送信できない...
    room.on('data', async (data) => {
        const peerId = data.src
        const type = data.data.type
        console.log(data)
        if (type == 'emotion') {
            const emotion = data.data.data
            if (emotion == "angry" || emotion == "disgusted" || emotion == "fearful" || emotion == "sad") {
                speechText("otherBad")
            }else if (emotion == "happy"){
                speechText("otherGood")
            }
            console.log(peerId + emotion)
        }else if (type == 'isWork') {
            const isWork = data.data.data
            speechText('otherNone')
        }
    });
}

// 全員へデータを送信する
function sendAllMember(data) {
    const connections = peer.connections
    Object.keys(connections).forEach(peerId => {
        if (connections[peerId][0].open) {
            if (data == null){
                data = "null"
            }
            connections[peerId][0].send(data)
        }
    })
}


// 受け取ったデータの処理
function receiveData(peerId, data) {
    const type = Object.prototype.toString.call(data);
    const dataType = data.type
    if (dataType == null) {
        if (type == "[object String]") {
            if (data != "null"){
                updateName(peerId, data)
            }
        }else{
            if (data == "null"){
                data = null
            }
            updateChart(peerId, data)
            updateTable(peerId, data)
        }
    }else{
        if (dataType == "message") {
            const emotion = data.data
            switch (emotion) {
                case 'happy': speechText("tanosisou"); break;
                case 'angry': speechText("daijoubu"); break;
                case 'sad': speechText("fight"); break;
                case 'surprised': speechText("nemui"); break;
                case 'disgusted': speechText("daijoubu"); break;
                case 'fearful': speechText("hitoride"); break;
            }
        }
    }


}

// live2d関係の初期化
function initLive2d() {
    const canvas = $(".avator-canvas")[0]
    canvas.width = $(".avator-canvas").width()
    canvas.height = $(".avator-canvas").height()
    console.log($(".avator-canvas").width())
    if (LAppDelegate.getInstance().initialize(canvas) == false) {
        return;
    }
    LAppDelegate.getInstance().run();
    avator = LAppLive2DManager.getInstance().getModel(0)
    return avator;
}

// 0: 通常，笑顔のまま,
// 1: 0+手を後ろ,
// 2: うなずき＋悩んでいる,
// 3: 2と一緒,
// 4: 手をしたに広げる（心配な感じ）,
// 5,6: 手を右へ左へ（笑顔）,
// 7: お辞儀
// 8: おじぎ,
// 9: びっくり＋顔照れ,
// 10:うなずき＋心配そう,
// 11:手を挙げて横にふる（違いますよー）,
// 12:手をしたに広げる（心配）,
// 13: ほぼ12,
// 14: 笑顔で腕組
// 15: 手を顔に持っていきうっとり表情,
// 16: 赤面（これ使わねーわ）,
// 17: 赤面で笑顔,
// 18: 赤面＋もじもじ,
// 19: 悩んでいる（考える人）,
// 20: 心ぴょんぴょん,
// 21: 笑顔で後ろ腕
// 22: 21+顔照れなし,
// 23: 怒ってすねる,
// 24: 驚きレベル１,
// 25: 驚きレベル2
// モーションを再生(no: 種類)

const voiceInterval = 30

// 声とモーションの対応関係(ファイル名と対応)
const voiceMotionMap = {
    "daijoubu": [4, 12, 13], "fight": [21], "hitoride": [12], "komatta": [12], 
    "sorosoro": [10], "TakeItEasy": [14], "tyant": [4], "YesWeCan": [25],
    "nonoshiri": [23], "tanosisou": [20], "nemui": [4], "ochituite": [19], "okgoogle2": [1],
    "start": [0], "otherGood": [21], "otherBad": [12], "otherNone": [4], "lunch": [5, 6],
}

// 各感情が発現した時に発話する言葉およびモーション
const emotionToVoiceList = {
    happy: ["tanosisou"], 
    angry: ["daijoubu", "ochituite", "komatta", "TakeItEasy"], 
    sad: ["daijoubu", "fight", "hitoride"], 
    neutral: [], 
    surprised: ["komatta", "nemui"], 
    disgusted: ["daijoubu", "hitoride"],
    fearful: ["daijoubu", "hitoride"],
}
function getRandomInt(max){
    return Math.floor(Math.random()*Math.floor(max));
}
const moveList = {
    "happy": [1,5,6,14,16,17,20,21,22],
    "daijoubu": [2, 4, 10, 12, 18, 19],
}
function startMotion(no){

    // if (kind == "happy" || kind == "happy2"){
    //     const animation = moveList["happy"]
    //     no = animation[getRandomInt(animation.length-1)]
    // } else if(kind == "daijoubu" || kind == "hitoride" || kind == "komatta" || kind == "nemui" || kind == "sorosoro"){
    //     const animation = moveList["daijoubu"]
    //     no = animation[getRandomInt(animation.length-1)]
    // } else if(kind == "fight" || kind == "YesWeCan" || kind == "TakeItEasy" || kind == "ochituite"){
    //     const animation = moveList["happy"]
    //     no = animation[getRandomInt(animation.length-1)]
    // } else if(kind == "neutral"){
    //     const animation = moveList["daijoubu"]
    //     no = animation[getRandomInt(animation.length-1)]
    // } else {
    //     const animation = moveList["happy"]
    //     no = animation[getRandomInt(animation.length-1)]
    // }
    console.log(no)
    avator.startMotion("All", no , 4, () => {
        console.log("finish")
    })
    
}

// 決められた種類のテキストを喋らせる(kind: 種類)
function speechText(kind) {
    const audioElem = $(".avator-voice").get(0)
    audioElem.src = `Resources/Voices/${kind}.wav`;
    console.log(audioElem.src)
    audioElem.play();
    const motionNumberList = voiceMotionMap[kind]
    if (motionNumberList){
        startMotion(motionNumberList[Math.floor(Math.random() * motionNumberList.length)]);
    }
    lastSpeakTime = Date.now()
}

// audioタグの音量レベルを取得
function getAnalyser($audio) {
    audioContext =  new AudioContext()
    audioContext.createBufferSource().start(0);
    const analyser = audioContext.createAnalyser()
    audioSource = audioContext.createMediaElementSource($audio);
    audioSource.connect(audioContext.destination)
    audioSource.connect(analyser)
    return analyser
}

// リップシンクに関する設定
function lipSync() {
    const analyser = getAnalyser($(".avator-voice")[0])
    var frequencies = new Uint8Array(analyser.frequencyBinCount);
    setInterval(() => {
        analyser.getByteTimeDomainData(frequencies)
        const avator_db = (Math.max.apply(null, frequencies) - 128)/64
        avator._volume = avator_db
    }, 100)
}


// 感情推定データからどの言葉を発するかの判定
function speakToUser(){

    const datasets = allChart["me"].data.datasets
    const expressionData = {}
    datasets.forEach(ele => {
        expressionData[ele.label] = ele.data
    });


    if (lastSpeakTime == null || (Date.now() - lastSpeakTime)/1000 > voiceInterval){

        if (expressionData['neutral'].every(v => v == null)){
            speechText("tyant")
            room.send({'type': 'isWork', 'data': false})
        }

        const aveEmotion = {emotion: null, score: 0}

        Object.keys(expressionData).forEach((ele) => {
            // console.log(ele)
            if (ele != "time"){
                const checkArr = expressionData[ele].slice(-11, -1)
                const ave = checkArr.reduce((acc, cur) => {return acc + cur}, 0)/checkArr.length
                // console.log(`${ele}:${ave}`)
                if (ave > aveEmotion.score) {
                    aveEmotion.emotion = ele
                    aveEmotion.score = ave
                }

            }
        })
        // console.log(exAveEmotion, aveEmotion)

        if (aveEmotion.score > 0.7){
            // const emotionToVoiceList = {happy: [9,10], angry: [0, 5, 12], sad: [1, 2, 3, 7], neutral: [], surprised: [11], disgusted: [5, 12]}
            // console.log(aveEmotion.emotion)
            if (aveEmotion.emotion != 'neutral') {
                room.send({'type': 'emotion', 'data': aveEmotion.emotion})
            }
            const speakKinds = emotionToVoiceList[aveEmotion.emotion]
            if (speakKinds.length != 0){
                const kind = speakKinds[Math.floor(Math.random() * speakKinds.length)]
                speechText(kind)
            }
        }

        // exAveEmotion.emotion = aveEmotion.emotion
        // exAveEmotion.score = aveEmotion.score
    } else if((Date.now() - lastSpeakTime)/1000 > 36000){
        // 1時間以上集中していたら休憩を促す．
        speechText("sorosoro")
    }

    // 時間による呼びかけ
    const nowTime = new Date()
    const nowHour = nowTime.getHours()
    if (nowHour == 12) {
        speechText("lunch")
    }
}

// グラフの初期化
function initChart(peerId) {
    const $remoteTemplate = $(`.remote-info[data-peer-id="${peerId}"]`)
    const canvas = $remoteTemplate.find('canvas')
    canvas[0].width = canvas.width()
    canvas[0].height = canvas.height()
    const expressionData = {time: Array(dataNum), angry: Array(dataNum), happy: Array(dataNum), disgusted: Array(dataNum), fearful: Array(dataNum), neutral: Array(dataNum), sad: Array(dataNum), surprised: Array(dataNum)};
    Object.keys(expressionData).forEach((ele) => {expressionData[ele].fill(null)})

    const datasets = []
    Object.keys(expressionData).forEach((ele) => {
        if (ele != 'time'){
            datasets.push({
                label: ele,
                data: expressionData[ele]
            })
        }
    })

    const chart = new Chart(canvas[0], {
        type: 'line',
        data: {
            labels: expressionData.time,
            datasets: datasets
        },
        options: {
            plugins: {
                colorschemes: {
                    scheme: 'brewer.Paired12'
                },
            },
            scales: {
                yAxes: [{
                    ticks: {
                        min: 0,
                        max: 1
                    }
                }]
            },
            responsive: false,
        },
    });
    allChart[peerId] = chart
}

// グラフの更新
function updateChart(peerId, result){
    const chart = allChart[peerId]
    const times = chart.data.labels
    const datasets = chart.data.datasets
    const nowTime = new Date()
    const time = `${nowTime.getHours()}:${nowTime.getMinutes()}:${nowTime.getSeconds()}`
    times.shift()
    times.push(time)
    if (result) {
        datasets.forEach(ele => {
            ele.data.shift()
            ele.data.push(result.expressions[ele.label])
        });
    }else{
        datasets.forEach(ele => {
            ele.data.shift()
            ele.data.push(null)
        });
    }
    chart.update()
}


// メインループの処理
async function updateMainLoop(result){
    if (isStart) {
        updateChart("me", result)
        updateTable("me", result)
        sendAllMember(result)
        speakToUser()
    }
}


const emotionLanguageMap = {"怒り": 'angry', '嫌悪': 'disgusted', '恐怖': 'fearful', '幸福': 'happy', '普通': 'neutral', '悲しみ': 'sad', '驚き': 'surprised'}

// テンプレートの追加
function appendRemoteTemplate(peerId) {
    const remoteTemp = $($("#remote-info-template").html())
    remoteTemp.attr("data-peer-id", peerId)
    remoteTemp.find("tr").on("click", (event) => {
        if (peerId != "me"){
            const connection = peer.connections[peerId][0]
            if (connection.open){
                const emotion = $(event.currentTarget).find("th").text()
                connection.send({'type': 'message', 'data': emotionLanguageMap[emotion]})
            }
        }
    })
    if($('.remote-infos-left').children().length < 2){
        $('.remote-infos-left').append(remoteTemp)
    }else{
        $('.remote-infos-right').append(remoteTemp)
    }
}

// テーブルの更新
function updateTable(peerId, result){
    const resultTable = $(`.remote-info[data-peer-id="${peerId}"] table`)

    if (result == null){
        resultTable.find('#be').text("休憩中");
        return;
    }

    const exp = result['expressions']
    const angry = Math.round(exp['angry'] * 100)
    const disgusted = Math.round(exp['disgusted'] * 100)
    const fearful = Math.round(exp['fearful'] * 100)
    const happy = Math.round(exp['happy'] * 100)
    const neutral = Math.round(exp['neutral'] * 100)
    const sad = Math.round(exp['sad'] * 100)
    const surprised = Math.round(exp['surprised'] * 100)

    resultTable.find('#be').text("作業中");
    resultTable.find('#angry').css({'width': angry + '%', 'color': 'black'});
    resultTable.find('#disgusted').css({'width': disgusted + '%', 'color': 'black'});
    resultTable.find('#fearful').css({'width': fearful + '%', 'color': 'black'});
    resultTable.find('#happy').css({'width': happy + '%', 'color': 'black'});
    resultTable.find('#neutral').css({'width': neutral + '%', 'color': 'black'});
    resultTable.find('#sad').css({'width': sad + '%', 'color': 'black'});
    resultTable.find('#surprised').css({'width': surprised + '%', 'color': 'black'});
}

// 名前の更新
function updateName(peerId, name){
    const resultTable = $(`.remote-info[data-peer-id="${peerId}"] table`)
    if (name != null){
        resultTable.find('#name').text(name)
    }
}
