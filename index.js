'use strict';

new class {
  static get SIZE() {return 12;}
  static get FOCUS() {return 2;}
  static get COUNT() {return 1;}
  static get SIZE_SMOOTHING() {return 200;}
  static get SIZE_LISTENING() {return 1000;}
  static get SIZE_BUFFER() {return 256;}
  static get CLEARANCE() {return 5;}
  static get THRESHOLD_AMPLITUDE() {return 1;}
  static get THRESHOLD_CLUSTER() {return 3;}
  static get HOLD() {return 3000;}
  static get SCALE() {return 10;}

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
    this.smoothing = 1;
    this.listening = 1;
    const clearance = constructor.CLEARANCE;
    this.boundLower = clearance * 2 - 1;
    this.boundUpper = width - clearance;
    const floor = analyser.minDecibels;
    this.thresholdAmplitude = constructor.THRESHOLD_AMPLITUDE + floor;

    const _canvas = this.canvas;
    this.context = _canvas.getContext('2d');
    _canvas.width = width;
    const height = _canvas.height = analyser.maxDecibels - floor;

    this.criterion = new criteria.amplitude(clearance);

    const constrain = value => Math.min(Math.max(value, 0), height);
    this.thresholdScore = constrain(Number(localStorage.getItem('threshold')));
    const scale = constructor.SCALE;
    const move = event => this.thresholdScore = Math.round(constrain(
      this.thresholdScoreOriginal + (this.y - event.clientY) / scale
    ));
    const remove = () => {
      pad.removeEventListener('pointermove', move);
      localStorage.setItem('threshold', String(this.thresholdScore));
    };
    const handleDown = event => {
      pad.setPointerCapture(event.pointerId);
      pad.addEventListener('pointermove', move);
      this.y = event.clientY;
      this.thresholdScoreOriginal = this.thresholdScore;
    };
    this.events = {
      'pointerdown': handleDown,
      'lostpointercapture': remove,
      'pointerup': remove
    };
    saveClear.onclick = () => {
      if (this.interval) {
        localStorage.clear('interval');
        this.update();
        this.toggle();
      } else this.save = true;
    };
    this.save = false;
    this.update();
    this.toggle();

    const renderBound = this.render.bind(this);
    this.renderBound = renderBound;
    requestAnimationFrame(renderBound);
  }

  render(time) {
    const context = this.context;
    const _canvas = this.canvas;
    const width = _canvas.width;
    const height = _canvas.height;
    const constructor = this.constructor;
    const analyser = this.analyser;
    const ceiling = analyser.maxDecibels;
    const floor = analyser.minDecibels;
    const candidateBins = new Array(width);
    const candidates = [];
    const averages = new Float32Array(width);
    const clearance = constructor.CLEARANCE;
    const clearanceWidth = clearance * 2 + 1;

    {
      const _window = this.window;
      const lengthWindow = _window.length;
      this.end = (this.end + 1) % lengthWindow;
      const frame = _window[this.end];
      if (frame.used) return;
      frame.used = true;
      frame.time = time;
      const data = frame.data;
      analyser.getFloatFrequencyData(data);
      while (time - _window[this.smoothing].time > constructor.SIZE_SMOOTHING)
        this.smoothing = (this.smoothing + 1) % lengthWindow;
      while (time - _window[this.listening].time > constructor.SIZE_LISTENING)
      {
        _window[this.listening].used = false;
        this.listening = (this.listening + 1) % lengthWindow;
      }

      const start = this.smoothing;
      const thisEnd = this.end;
      const end = 1 + (thisEnd > start? thisEnd : thisEnd + lengthWindow);
      const total = new Float32Array(width);
      for (let indexFrame = start; indexFrame < end; indexFrame++) {
        const data = _window[indexFrame % lengthWindow].data;
        for (let indexBin = 0; indexBin < width; indexBin++)
          total[indexBin] += data[indexBin];
      }

      const count = end - start;
      let average;
      const boundLower = this.boundLower;
      const boundUpper = this.boundUpper;
      let middle;
      let indexMiddle;
      const thresholdAmplitude = this.thresholdAmplitude;
      let slice;
      const criterion = this.criterion;
      const evaluate = criterion.evaluate.bind(criterion);

      for (let indexBin = 0; indexBin < width; indexBin++) {
        average = averages[indexBin] = total[indexBin] / count;
        if (indexBin > boundLower && indexBin < boundUpper) {
          indexMiddle = indexBin - clearance;
          middle = averages[indexMiddle];
          slice = averages.slice(indexBin + 1 - clearanceWidth, indexBin + 1);
          if (
            middle > thresholdAmplitude
            && averages[indexMiddle - 1] < middle
            && middle > averages[indexMiddle + 1]
            && Math.max(...slice) === middle
          ) candidates.push(
            candidateBins[indexMiddle] = {bin: indexMiddle, score: evaluate(slice)}
          );
          else candidateBins[indexMiddle] = null;
        }
      }
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);

    const _interval = this.interval;
    const peaks = [];
    {
      let average;
      let candidate;
      let color;
      const threshold = _interval? this.thresholdScore : 0;
      for (let indexBin = 0; indexBin < width; indexBin++) {
        candidate = candidateBins[indexBin];
        if (candidate) {
          if (candidate.score > threshold) {
            peaks.push(candidate.bin);
            color = 'orange';
          } else color = 'purple';
          context.fillStyle = color;
          context.fillRect(indexBin, 0, 1, height);
        }
        average = averages[indexBin];
        context.fillStyle = 'red';
        context.fillRect(indexBin, ceiling - average, 1, average - floor);
        if (candidate) {
          context.fillStyle = 'green';
          context.fillRect
            (indexBin, height - candidate.score, 1, candidate.score);
        }
      }
    }

    if (_interval) {
      context.fillStyle = 'white';
      context.fillRect(0, height - this.thresholdScore - 0.5, width, 1);
    }

    const lengthPeaks = peaks.length;
    if (lengthPeaks > 1) {
      const differences = new Array(lengthPeaks * (lengthPeaks - 1) / 2);
      const differencePeaks = new Array
        (Math.max(...peaks) - Math.min(...peaks) + 1).fill(Infinity);
      {
        let differenceIndex = 0;
        let second;
        let difference;
        let peakFirst;
        let peakSecond;
        for (let first = 1; first < lengthPeaks; first++)
          for (second = 0; second < first; second++) {
            peakFirst = peaks[first];
            peakSecond = peaks[second];
            difference = Math.abs(peakFirst - peakSecond);
            differences[differenceIndex++] = difference;
            differencePeaks[difference]
              = Math.min(differencePeaks[difference], peakFirst, peakSecond);
          }
        differences.sort((_first, _second) => _first - _second);
        differences.push(null);
      }

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
      }
      differenceFrequencies.push({frequency: 0});
      const thresholdCluster = maximum / this.constructor.THRESHOLD_CLUSTER;

      let cluster = [];
      let total = 0;
      let count = 0;
      {
        let current = null;
        let difference;
        let frequency;
        for (const differenceFrequency of differenceFrequencies) {
          frequency = differenceFrequency.frequency;
          if (frequency > thresholdCluster) {
            if (current === null) current = differenceFrequency.difference - 1;
            current++;
            difference = differenceFrequency.difference;
            if (current !== difference) break;
            cluster.push(current);
            total += difference * frequency;
            count += frequency;
          }
        }
      }
      const offset
        = Math.min(...cluster.map(difference => differencePeaks[difference]));
      let _interval = total / count;

      interval.innerHTML = Math.round(_interval * 10) / 10;

      if (this.save) {
        localStorage.setItem('interval', _interval);
        this.save = false;
        this.update();
        this.toggle();
      };
    }

    requestAnimationFrame(this.renderBound);
  }

  update() {
    const _interval = Number(localStorage.getItem('interval'));
    this.interval = _interval;
    this.sizeSmoothing
      = _interval? constructor.SIZE_SMOOTHING : constructor.SIZE_LISTENING;
    saveClear.innerHTML = _interval? "🧹" : "✏️";
  }

  toggle() {
    let method;
    if (this.interval) {
      method = pad.addEventListener;
      pad.classList.remove('disabled');
    } else {
      method = pad.removeEventListener;
      pad.classList.add('disabled');
    }
    for (const [event, handler] of Object.entries(this.events))
      method.bind(pad)(event, handler);
  }
}(canvas).load();

const criteria = {
  'amplitude': class {
    constructor(clearance) {
      this.clearance = clearance;
    }

    evaluate(peaks) {
      return peaks[this.clearance] - Math.min(...peaks);
    }
  }
};
