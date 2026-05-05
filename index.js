'use strict';

new class {
  static get SIZE() {return 12;}
  static get FOCUS() {return 2;}
  static get COUNT() {return 1;}
  static get SIZE_WINDOW() {return 1000;}
  static get SIZE_BUFFER() {return 256;}

  constructor(_canvas) {this.canvas = _canvas;}

  load() {document.addEventListener('DOMContentLoaded', this.run.bind(this));}

  async run() {
    const constructor = this.constructor;

    const context = new AudioContext();
    context.resume();
    const source = context.createMediaStreamSource
      (await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: constructor.COUNT,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }));
    const analyser = new AnalyserNode(
      context,
      {
        fftSize: 2 ** constructor.SIZE,
        channelCount: constructor.COUNT,
        channelCountMode: 'explicit'
      }
    );
    this.analyser = analyser;
    source.connect(analyser);
    const count = analyser.frequencyBinCount;
    this.data = new Uint8Array(count);
    const width = count / constructor.FOCUS ** 2;
    this.window = Array.from(
      {length: constructor.SIZE_BUFFER},
      () => ({used: false, time: null, data: new Float32Array(count)})
    );
    this.end = 0;
    this.start = 1;

    const _canvas = this.canvas;
    this.context = _canvas.getContext('2d');
    _canvas.width = width;
    _canvas.height = analyser.maxDecibels - analyser.minDecibels;

    const renderBound = this.render.bind(this);
    this.renderBound = renderBound;
    requestAnimationFrame(renderBound);
  }

  render(time) {
    const constructor = this.constructor;
    const analyser = this.analyser;

    const _window = this.window;
    const lengthWindow = _window.length;
    this.end = (this.end + 1) % lengthWindow;
    const frame = _window[this.end];
    if(frame.used) return;
    frame.used = true;
    frame.time = time;
    const data = frame.data;
    analyser.getFloatFrequencyData(data);
    while (time - _window[this.start].time > constructor.SIZE_WINDOW) {
      _window[this.start].used = false;
      this.start = (this.start + 1) % lengthWindow;
    }

    const context = this.context;
    const _canvas = this.canvas;
    const length = _canvas.width;
    const height = _canvas.height;
    const ceiling = analyser.maxDecibels;
    const floor = analyser.minDecibels;
    context.clearRect(0, 0, length, height);
    context.fillStyle = 'black';
    context.fillRect(0, 0, length, height);

    const start = this.start;
    const thisEnd = this.end;
    const end = 1 + (thisEnd > start? thisEnd : thisEnd + lengthWindow);
    const total = new Float32Array(length);
    for (let indexFrame = start; indexFrame < end; indexFrame++) {
      const data = _window[indexFrame % lengthWindow].data;
      for(let indexBin = 0; indexBin < length; indexBin++)
        total[indexBin] += data[indexBin];
    }

    const count = end - start;
    let average = 0;
    let oldAverage;
    let positive = true;
    let oldPositive;
    context.fillStyle = 'red';
    for(let indexBin = 0; indexBin < length; indexBin++) {
      oldAverage = average;
      oldPositive = positive;

      average = total[indexBin] / count;
      positive = average > oldAverage;

      if(oldPositive && !positive && oldAverage - floor > 0) {
        context.fillStyle = 'purple';
        context.fillRect(indexBin - 1, 0, 1, ceiling - average);
        context.fillStyle = 'red';
      }
      context.fillRect(indexBin, ceiling - average, 1, average - floor);
    }

    requestAnimationFrame(this.renderBound);
  }
}(canvas).load();
