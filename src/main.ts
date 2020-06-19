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
let avator = null;
const dataNum = 100;
const allChart = {};
let lastSpeakTime = null;
// ブラウザロード時の処理
$(async () => {
    const API_KEY = ''
    initModal()
    initFaceApi()
    await initPeer(API_KEY);

    avator = initLive2d()
    // lipSync()

    appendRemoteTemplate("me")
    initChart("me")
});

// ブラウザロード後の処理
window.onbeforeunload = (): void => LAppDelegate.releaseInstance();

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
            if (data == "null") {
                data = null
            }
            updateChart(peerId, data)
            updateTable(peerId, data)
        });
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
            if (data == "null"){
                data = null
            }
            updateChart(peerId, data)
            updateTable(peerId, data)
        });
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
        const type = Object.prototype.toString.call(data.data);
        if (type == "[object Object]" || type == "[object Undefined]"){
            const result = data.data
            const peerId = data.src
            // drawResultTable(result, peerId)
        }else{
            console.log(type)
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

// 0: 通常，笑顔のまま, 1: 0+手を後ろ, 2: うなずき＋悩んでいる, 3: 2と一緒, 4: 手をしたに広げる（心配な感じ）, 5,6: 手を右へ左へ（笑顔）, 7:お辞儀
// 8: おじぎ, 9:びっくり＋顔照れ, 10:うなずき＋心配そう, 11:手を挙げて横にふる（違いますよー）, 12:手をしたに広げる（心配）, 13: ほぼ12, 14: 笑顔で腕組
// 15:手を顔に持っていきうっとり表情, 16: 赤面（これ使わねーわ）, 17:赤面で笑顔, 18:赤面＋もじもじ, 19: 悩んでいる（考える人）, 20: 心ぴょんぴょん, 21: 笑顔で後ろ腕
// 22: 21+顔照れなし, 23:怒ってすねる, 24:驚きレベル１, 25: 驚きレベル2
// モーションを再生(no: 種類)
function startMotion(no){
    avator.startMotion("All", no , 4, () => {console.log("finish")})
}

// 決められた種類のテキストを喋らせる(kind: 種類)
function speechText(kind) {
    const filename = ["daijoubu", "fight", "hitoride", "komatta", "sorosoro", "TakeItEasy", "tyant", "YesWeCan"]
    const audioElem = $(".avator-voice").get(0)
    audioElem.src = `Resources/Voices/${filename[kind]}.wav`;
    console.log(audioElem.src)
    audioElem.play();
}

// audioタグの音量レベルを取得
function getAnalyser($audio) {
    const audioContext =  new AudioContext()
    audioContext.createBufferSource().start(0);
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaElementSource($audio);
    source.connect(audioContext.destination)
    source.connect(analyser)
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


    if (lastSpeakTime == null || (Date.now() - lastSpeakTime)/1000 > 10){

        if (expressionData['neutral'].every(v => v == null)){
            speechText(6)
            lastSpeakTime = Date.now()
        }

        const aveEmotion = {emotion: null, score: 0}
        Object.keys(expressionData).forEach((ele) => {
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

        if (aveEmotion.score > 0.7){
            const emotionToVoiceList = {happy: [4], angry: [0, 5], sad: [1, 2, 3, 7], neutral: [], surprised: [], disgusted: []}
            console.log(aveEmotion.emotion)
            const speakKinds = emotionToVoiceList[aveEmotion.emotion]
            if (speakKinds.length != 0){
                const kind = speakKinds[Math.floor(Math.random() * speakKinds.length)]
                speechText(kind)
                lastSpeakTime = Date.now()
            }
        }
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

// テンプレートの追加
function appendRemoteTemplate(peerId) {
    const remoteTemp = $($("#remote-info-template").html())
    remoteTemp.attr("data-peer-id", peerId)
    if($('.remote-infos-left').children().length < 2){
        $('.remote-infos-left').append(remoteTemp)
    }else{
        $('.remote-infos-right').append(remoteTemp)
    }
}

// テーブルの更新
function updateTable(peerId, result){
    const resultTable = $(`.remote-info[data-peer-id="${peerId}"] table`)

    resultTable.find('#name').text(myName)
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