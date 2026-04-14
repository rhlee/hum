'use strict';

new class {
  static get SIZE() {return 8;}
  static get COUNT() {return 1;}
  static get MAXIMUM() {return 255;}

  constructor(_canvas) {this.canvas = _canvas;}

  load() {document.addEventListener('DOMContentLoaded', this.run.bind(this));}

  async run() {
    const context = new AudioContext();
    context.resume();
    const source = context.createMediaStreamSource
      (await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: this.COUNT,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }));
    this.analyser = new AnalyserNode(
      context,
      {
        fftSize: this.constructor.SIZE ** 2,
        channelCount: this.constructor.COUNT,
        channelCountMode: 'explicit'
      }
    );
    source.connect(this.analyser);
    const count = this.analyser.frequencyBinCount;
    this.data = new Uint8Array(count);

    const _canvas = this.canvas;
    this.context = _canvas.getContext('2d');
    _canvas.width = count;
    _canvas.height = this.constructor.MAXIMUM;

    const renderBound = this.render.bind(this);
    this.renderBound = renderBound;
    requestAnimationFrame(renderBound);
  }

  render() {
    const context = this.context;

    const maximum = this.constructor.MAXIMUM;
    const data = this.data;
    const length = data.length;
    context.clearRect(0, 0, length, maximum);
    context.fillStyle = 'black';
    context.fillRect(0, 0, length, maximum);

    this.analyser.getByteFrequencyData(data);

    context.fillStyle = 'red';
    for(let index = 0; index < length; index++) {
      const value = data[index];
      context.fillRect(index, maximum - value, 1, value);
    }

    requestAnimationFrame(this.renderBound);
  }
}(canvas).load();
