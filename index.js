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
  static get THRESHOLD_INTERVAL() {return 1;}
  static get THRESHOLD_ACTIVATION() {return 0.9;}
  static get HOLD() {return 3000;}
  static get SCALE() {return 10;}
  static get FILE() {return "gong.ogg";}

  constructor(_canvas) {this.canvas = _canvas;}

  load() {
    document.addEventListener(
      'DOMContentLoaded',
      async () => {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: constructor.COUNT,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          });
        } catch {}

        if (stream) {
          if (window.matchMedia("(pointer: coarse)").matches)
            document.body.addEventListener
              ('click', async () => this.run(stream), {once: true});
          else this.run(stream);
        } else document.body.innerHTML = "microphone blocked";
      }
    );
  }

  async run(stream) {
    this.stream = stream;

    const constructor = this.constructor;

    const context = new AudioContext();
    this.contextAudio = context;
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    this.source = source;

    this.buffer = await context.decodeAudioData
      (await (await fetch(this.constructor.FILE)).arrayBuffer());

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
      () => ({
        used: false,
        time: null,
        data: new Float32Array(count),
        activated: false
      })
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
    this.contextCanvas = _canvas.getContext('2d');
    _canvas.width = width;
    const height = _canvas.height = analyser.maxDecibels - floor;

    this.criterion = new criteria.amplitude(clearance);

    const constrain = value => Math.min(Math.max(value, 0), height);
    this.thresholdScore
      = constrain(Number(localStorage.getItem('threshold')));
    const scale = constructor.SCALE;
    const move = event => this.thresholdScore = Math.round(constrain(
      this.thresholdScoreOriginal + (this.y - event.clientY) / scale
    ));
    const remove = () => {
      pad.removeEventListener('pointermove', move);
      localStorage.setItem('threshold', String(this.thresholdScore));
    };
    this.handlers = {
      'pointerdown': event => {
        this.drag = true;
        pad.setPointerCapture(event.pointerId);
        pad.addEventListener('pointermove', move);
        this.y = event.clientY;
        this.thresholdScoreOriginal = this.thresholdScore;
      },
      'lostpointercapture': event => this.drag? undefined : remove(),
      'pointerup': remove
    };
    saveClear.onclick = () => {
      if (this.interval) {
        localStorage.removeItem('interval');
        this.update();
        this.toggle();
      } else this.save = true;
    };
    this.save = false;
    this.update();
    this.toggle();

    timer.addEventListener(
      'transitionend',
      () => {
        document.exitFullscreen();
        this.play();
      }
    );
    document.body.className = 'listener';
    document.documentElement.requestFullscreen();

    const renderBound = this.render.bind(this);
    this.renderBound = renderBound;
    requestAnimationFrame(renderBound);
  }

  render(time) {
    const contextCanvas = this.contextCanvas;
    const _canvas = this.canvas;
    const width = _canvas.width;
    const height = _canvas.height;
    const constructor = this.constructor;
    const analyser = this.analyser;
    const ceiling = analyser.maxDecibels;
    const floor = analyser.minDecibels;
    const candidateBins = new Array(width);
    const averages = new Float32Array(width);
    const clearance = constructor.CLEARANCE;
    const clearanceWidth = clearance * 2 + 1;

    const _window = this.window;
    const lengthWindow = _window.length;
    this.end = (this.end + 1) % lengthWindow;
    const frameCurrent = _window[this.end];
    {
      if (frameCurrent.used) return;
      frameCurrent.used = true;
      frameCurrent.time = time;
      const data = frameCurrent.data;
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
          candidateBins[indexMiddle]
            =
            middle > thresholdAmplitude
            && averages[indexMiddle - 1] < middle
            && middle > averages[indexMiddle + 1]
            && Math.max(...slice) === middle?
              {bin: indexMiddle, score: evaluate(slice)}
              : candidateBins[indexMiddle] = null;
        }
      }
    }

    contextCanvas.clearRect(0, 0, width, height);
    contextCanvas.fillStyle = 'black';
    contextCanvas.fillRect(0, 0, width, height);

    const intervalTarget = this.interval;
    const peaks = [];
    {
      let average;
      let candidate;
      let color;
      const threshold = intervalTarget? this.thresholdScore : 0;
      for (let indexBin = 0; indexBin < width; indexBin++) {
        candidate = candidateBins[indexBin];
        if (candidate) {
          if (candidate.score > threshold) {
            peaks.push(candidate.bin);
            color = 'orange';
          } else color = 'purple';
          contextCanvas.fillStyle = color;
          contextCanvas.fillRect(indexBin, 0, 1, height);
        }
        average = averages[indexBin];
        contextCanvas.fillStyle = 'red';
        contextCanvas
          .fillRect(indexBin, ceiling - average, 1, average - floor);
        if (candidate) {
          contextCanvas.fillStyle = 'green';
          contextCanvas.fillRect
            (indexBin, height - candidate.score, 1, candidate.score);
        }
      }
    }

    if (intervalTarget) {
      contextCanvas.fillStyle = 'white';
      contextCanvas.fillRect(0, height - this.thresholdScore, width, 1);
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
            if (current === null)
              current = differenceFrequency.difference - 1;
            current++;
            difference = differenceFrequency.difference;
            if (current !== difference) break;
            cluster.push(current);
            total += difference * frequency;
            count += frequency;
          }
        }
      }
      let intervalCurrent = Math.round(total / count * 10) / 10;

      if (intervalTarget) frameCurrent.activated
        = intervalCurrent - intervalTarget
        < this.constructor.THRESHOLD_INTERVAL;
      else bar.innerHTML = intervalCurrent;

      if (this.save) {
        localStorage.setItem('interval', intervalCurrent);
        this.save = false;
        this.update();
        this.toggle();
      };
    } else frameCurrent.activated = false;

    if (intervalTarget) {
      const _window = this.window;
      let total = 0;
      let count = 0;
      for (
        const slice
        of this.listening < this.smoothing?
          [_window.slice(this.listening, this.smoothing)]
          : [
            _window.slice(this.listening, lengthWindow + 1),
            [_window.slice(0, this.smoothing)]
          ]
      ) {
        for (const frameSlice of slice) if (frameSlice.activated) total += 1;
        count += slice.length;
      }
      const activation = total / count / constructor.THRESHOLD_ACTIVATION;
      bar.style.width = activation * 100 + "%";
      if (activation >= 1) {
        this.source.disconnect();
        this.analyser.disconnect();
        for (const track of this.stream.getTracks()) track.stop();
        document.body.className = 'timer';
        requestAnimationFrame(() => {
          timer.className = 'active';
          this.play();
        });
      } else requestAnimationFrame(this.renderBound);
    } else requestAnimationFrame(this.renderBound);
  }

  update() {
    if (this.interval = Number(localStorage.getItem('interval'))) {
      this.sizeSmoothing = constructor.SIZE_SMOOTHING;
      saveClear.innerHTML = "🧹";
      bar.innerHTML = "";
    } else {
      this.sizeSmoothing = constructor.SIZE_LISTENING;
      saveClear.innerHTML = "✏️";
      bar.style.removeProperty('width');
    }
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
    for (const [event, handler] of Object.entries(this.handlers))
      method.bind(pad)(event, handler);
  }

  play() {
    const context = this.contextAudio;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(context.destination);
    source.start();
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
