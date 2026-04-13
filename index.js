'use strict';

new class {
  static get SIZE() {return 8;}
  static get COUNT() {return 1;}
  static get MAXIMUM() {return 2 ** 8 - 1;}

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
        fftSize: self.SIZE,
        channelCount: self.COUNT,
        channelCountMode: 'explicit'
      }
    );
    source.connect(this.analyser);
    const count = this.analyser.frequencyBinCount;
    this.data = new Uint8Array(count);

    const _canvas = this.canvas;
    this.context = _canvas.getContext('2d');
    this.width = _canvas.width / count;

    const renderBound = this.render.bind(this);
    this.renderBound = renderBound;
    requestAnimationFrame(renderBound);
  }

  render() {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);

    const data = this.data;
    this.analyser.getByteFrequencyData(data);
    const length = data.length;
    const widthBar = this.width;

    context.fillStyle = 'red';
    for(let index = 0; index < length; index++) {
      const heightBar = data[index] / 255;
      context.fillRect(
        index * widthBar,
        height * (1 - heightBar),
        widthBar,
        height * heightBar
      );
    }

    requestAnimationFrame(this.renderBound);
  }
}(canvas).load();
