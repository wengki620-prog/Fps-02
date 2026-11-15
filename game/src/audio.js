// Efek suara prosedural WebAudio: tanpa file suara, tanpa request jaringan.
// Setiap suara disintesis dari osilator dan noise buffer yang dibuat sekali.
// AudioContext dibuat malas dan dilanjutkan saat gestur pertama (klik bermain).
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
    const length = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() {
    if (ensure() && context.state === 'suspended') context.resume();
  }

  function volumeFor(distance) {
    if (distance == null) return 1;
    return 1 / (1 + distance * 0.09);
  }

  function noise(when, duration, gainValue, filterFreq, type = 'lowpass') {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function tone(when, freqFrom, freqTo, duration, gainValue, type = 'sine') {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freqFrom, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  function play(fn, distance) {
    if (!ensure()) return;
    if (context.state === 'suspended') return;
    fn(context.currentTime, volumeFor(distance));
  }

  return {
    resume,
    shot(kind, distance) {
      play((when, volume) => {
        if (kind === 'shotgun') {
          noise(when, 0.28, 0.9 * volume, 900);
          tone(when, 120, 45, 0.22, 0.5 * volume, 'triangle');
        } else if (kind === 'smg') {
          noise(when, 0.09, 0.55 * volume, 2400);
          tone(when, 220, 80, 0.07, 0.3 * volume, 'square');
        } else if (kind === 'pistol') {
          noise(when, 0.12, 0.6 * volume, 1800);
          tone(when, 180, 60, 0.1, 0.35 * volume, 'triangle');
        } else {
          noise(when, 0.14, 0.7 * volume, 1500);
          tone(when, 160, 55, 0.12, 0.4 * volume, 'triangle');
        }
      }, distance);
    },
    reload() {
      play((when, volume) => {
        tone(when, 900, 500, 0.06, 0.25 * volume, 'square');
        tone(when + 0.18, 700, 400, 0.06, 0.25 * volume, 'square');
      });
    },
    empty() {
      play((when, volume) => tone(when, 1200, 900, 0.05, 0.2 * volume, 'square'));
    },
    hit(kill) {
      play((when, volume) => {
        tone(when, kill ? 1400 : 1050, kill ? 900 : 800, 0.07, 0.3 * volume, 'sine');
      });
    },
    hurt() {
      play((when, volume) => tone(when, 200, 90, 0.15, 0.4 * volume, 'sawtooth'));
    },
    explosion(distance) {
      play((when, volume) => {
        noise(when, 0.9, 1.0 * volume, 400);
        tone(when, 90, 28, 0.8, 0.8 * volume, 'sine');
      }, distance);
    },
    bounce() {
      play((when, volume) => tone(when, 500, 300, 0.06, 0.25 * volume, 'triangle'));
    },
    beep() {
      play((when, volume) => tone(when, 1320, 1320, 0.09, 0.3 * volume, 'sine'));
    },
    plant() {
      play((when, volume) => {
        tone(when, 660, 660, 0.12, 0.3 * volume, 'sine');
        tone(when + 0.16, 880, 880, 0.16, 0.3 * volume, 'sine');
      });
    },
    buy() {
      play((when, volume) => tone(when, 780, 1040, 0.09, 0.25 * volume, 'sine'));
    },
    win() {
      play((when, volume) => {
        tone(when, 523, 523, 0.14, 0.3 * volume, 'sine');
        tone(when + 0.15, 659, 659, 0.14, 0.3 * volume, 'sine');
        tone(when + 0.3, 784, 784, 0.24, 0.3 * volume, 'sine');
      });
    },
    lose() {
      play((when, volume) => {
        tone(when, 392, 392, 0.16, 0.3 * volume, 'sine');
        tone(when + 0.17, 330, 330, 0.26, 0.3 * volume, 'sine');
      });
    },
  };
}
