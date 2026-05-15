'use strict';

new class {
  static get SIZE() {return 12;}
  static get FOCUS() {return 2;}
  static get COUNT() {return 1;}
  static get SIZE_WINDOW() {return 1000;}
  static get SIZE_BUFFER() {return 256;}
  static get CLEARANCE() {return 5;}
  static get THRESHOLD() {return 1;}

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
    const clearance = constructor.CLEARANCE;
    this.boundLower = clearance * 2 - 1;
    this.boundUpper = width - clearance;
    this.threshold = constructor.THRESHOLD + analyser.minDecibels;

    const _canvas = this.canvas;
    this.context = _canvas.getContext('2d');
    _canvas.width = width;
    _canvas.height = analyser.maxDecibels - analyser.minDecibels;
    _canvas.onclick = () => {this.clicked = true;};

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
    if (frame.used) return;
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
      for (let indexBin = 0; indexBin < length; indexBin++)
        total[indexBin] += data[indexBin];
    }

    const count = end - start;
    let average;
    const averages = new Float32Array(length);
    const boundLower = this.boundLower;
    const boundUpper = this.boundUpper;
    const clearance = constructor.CLEARANCE;
    let middle;
    let indexMiddle;
    const threshold = this.threshold;
    const clearanceWidth = clearance * 2 + 1;
    const peaksBoolean = new Array(length);
    const peaks = [];
    let peak;

    context.fillStyle = 'red';
    for (let indexBin = 0; indexBin < length; indexBin++) {
      average = averages[indexBin] = total[indexBin] / count;
      if (indexBin > boundLower && indexBin < boundUpper) {
        indexMiddle = indexBin - clearance;
        middle = averages[indexMiddle];
        peaksBoolean[indexMiddle]
          = middle > threshold &&
          averages[indexMiddle - 1] < middle &&
          middle > averages[indexMiddle + 1]
            && Math.max(
              ...averages.slice(indexBin + 1 - clearanceWidth, indexBin + 1)
            )
            === middle &&
          peaks.push(indexBin);
      }
    }

    context.fillStyle = 'red';
    for (let indexBin = 0; indexBin < length; indexBin++) {
      if (peaksBoolean[indexBin]) {
        context.fillStyle = 'purple';
        context.fillRect(indexBin, 0, 1, ceiling - floor);
        context.fillStyle = 'red';
      }
      average = averages[indexBin];
      context.fillRect(indexBin, ceiling - average, 1, average - floor);
    }

    if (this.clicked) {
      const lengthPeaks = peaks.length;
      const differences = new Array((lengthPeaks * (lengthPeaks - 1) / 2) + 1);
      let differenceIndex = 0;
      let second;
      for (let first = 1; first < lengthPeaks; first++)
        for (second = 0; second < first; second++)
          differences[differenceIndex++]
            = Math.abs(peaks[first] - peaks[second]);
      differences.sort((_first, _second) => _first - _second);

      const differenceFrequencies = new Array();
      let maximum = 0;
      {
        let difference = differences[0];
        let frequency = 0;
        for (const _difference of differences) {
          if (_difference === difference) frequency++;
          else {
            differenceFrequencies.push
              ({difference: difference, frequency: frequency});
            if (frequency > maximum) maximum = frequency;
            difference = _difference;
            frequency = 1;
          }
        }
        this.log(differenceFrequencies);
        this.log(maximum);
      }
      differenceFrequencies.push(null);
      const cutoff = maximum / 3;

      {
        let total = 0;
        let count = 0;
        let current = null;
        let difference;
        let frequency;
        for (const differenceFrequency of differenceFrequencies) {
          frequency = differenceFrequency.frequency;
          if (frequency > cutoff) {
            if (current === null) current = differenceFrequency.difference - 1;
            current++;
            difference = differenceFrequency.difference;
            if (current !== difference) break;
            total += difference * frequency;
            count += frequency;
          }
        }
        this.log([total, count, total / count]);
      }

      this.clicked = false;
    }

    requestAnimationFrame(this.renderBound);
  }

  log(message) {
    fetch(
      "",
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(message)
      }
    );
  }
}(canvas).load();
