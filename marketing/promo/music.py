"""Фоновая музыка для промо-ролика — синтез с нуля (numpy), без сэмплов и чужих треков,
поэтому права на неё не нужны.  python3 music.py длительность_с время_логотипа_с файл.wav

Лёгкий «корпоративный» поп: Am – F – C – G. Темп подбирается так, чтобы 5-й такт (вступление
барабанов) совпал с появлением логотипа: 10,36 с в озвученной версии (92,7 уд/мин), 8,6 с в немой.
  такты 1–2  пэд и арпеджио
  такты 3–4  + шейкер и бас, в конце 4-го — нарастающий шум к логотипу
  такты 5…  + бочка, хэты, с 9-го — хлопки
  предпоследний такт без барабанов, последний — финальный аккорд C и затухание
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 46.0
LOGO = float(sys.argv[2]) if len(sys.argv) > 2 else 10.36
OUT = sys.argv[3] if len(sys.argv) > 3 else 'music.wav'
BAR = LOGO / 4                        # длительность такта, с
BEAT = BAR / 4
N = int((DUR + 3) * SR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
REV = np.zeros(N)                     # что отправляется в реверберацию (моно)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def put(buf, start, sig):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    buf[i: i + len(sig)] += sig


def tone(f, dur, harm, decay=None, attack=0.005, release=0.08, detune=0.0):
    """Аддитивный тон: harm — амплитуды гармоник; decay — время затухания (с) или None (держится)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for k, a in enumerate(harm, 1):
        fk = f * k * (1 + detune)
        if fk > 9000:
            break
        warm = 1 / (1 + (fk / 2500) ** 2)          # мягкий срез верхов
        env = np.exp(-t * k / decay) if decay else 1.0
        s += a * warm * env * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release).clip(0, 1)
    return s * env


SAW = [1 / k for k in range(1, 24)]

#           пэд (3 голоса)   арпеджио (низ, середина, верх)   бас
CHORDS = {
    'Am': ([57, 60, 64], [69, 72, 76], 45),
    'F':  ([57, 60, 65], [69, 72, 77], 41),
    'C':  ([55, 60, 64], [67, 72, 76], 48),
    'G':  ([55, 59, 62], [67, 71, 74], 43),
}
NBARS = int((DUR - 1.8) // BAR) + 1                # финальный аккорд — не позже чем за 1,8 с до конца
PROG = (['Am', 'F', 'C', 'G'] * 9)[: NBARS - 2] + ['F', 'C']
FULL = len(PROG) - 2                              # последний такт с барабанами
ARP = [0, 1, 2, 1, 3, 2, 1, 2]                    # 3 = нижний тон октавой выше

for b, name in enumerate(PROG):
    bar = b + 1
    t0 = b * BAR
    pad, arp, bass = CHORDS[name]
    last = name == 'C' and bar == len(PROG)
    plen = BAR * (2.2 if last else 1.0) + 0.6
    # пэд: два слегка расстроенных «пилы» на голос, по разные стороны стерео
    pv = 0.05 if bar <= 2 else 0.06
    for m in pad:
        for side, dt in ((L, -0.004), (R, 0.004)):
            put(side, t0, pv * tone(hz(m), plen, SAW, attack=0.45, release=0.6, detune=dt))
    put(REV, t0, 0.5 * pv * tone(hz(pad[1]), plen, SAW, attack=0.45, release=0.6))
    # арпеджио восьмыми: тон как у маримбы/э-пиано, с эхом на пунктирную восьмую
    steps = 4 if last else 8
    av = 0.09 if bar <= 2 else 0.11
    for i in range(steps):
        m = arp[ARP[i]] if ARP[i] < 3 else arp[0] + 12
        st = t0 + i * BEAT / 2
        s = av * tone(hz(m), 0.9 if not last else 2.5, [1, .45, .22, .1], decay=0.42 if not last else 1.2, attack=0.003, release=0.2)
        pan = 0.35 * np.sin(i * 1.3)
        put(L, st, s * (1 - pan)); put(R, st, s * (1 + pan))
        put(REV, st, 0.6 * s)
        put(L, st + BEAT * 0.75, 0.25 * s * (1 + pan)); put(R, st + BEAT * 0.75, 0.25 * s * (1 - pan))
    # бас: с 3-го такта; с 5-го — восьмыми с «качелью»
    if bar >= 3:
        bv = 0.10 if bar <= 4 else 0.16
        if last:
            s = bv * tone(hz(bass), BAR * 1.6, [1, .5, .25], attack=0.02, release=1.2)
            put(L, t0, s); put(R, t0, s)
        else:
            busy = 5 <= bar <= FULL
            for i in range(8 if busy else 2):
                ln = BEAT / 2 if busy else BAR / 2
                s = bv * tone(hz(bass), ln, [1, .55, .3, .12], attack=0.012, release=0.06)
                put(L, t0 + i * ln, s); put(R, t0 + i * ln, s)
    # барабаны
    if 5 <= bar <= FULL:
        for q in range(4):
            st = t0 + q * BEAT
            n = int(0.32 * SR); t = np.arange(n) / SR
            f = 48 + 110 * np.exp(-t / 0.035)
            kick = 0.32 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
            put(L, st, kick); put(R, st, kick)
            # хэт на слабую долю
            n = int(0.06 * SR); t = np.arange(n) / SR
            hat = np.diff(rng.standard_normal(n + 1)) * np.exp(-t / 0.018) * 0.022
            put(L, st + BEAT / 2, hat * 1.1); put(R, st + BEAT / 2, hat * 0.9)
            if bar >= 9 and q in (1, 3):
                n = int(0.25 * SR); t = np.arange(n) / SR
                nz = rng.standard_normal(n)
                clap = (nz - np.concatenate(([0], nz[:-1])) * 0.6) * np.exp(-t / 0.06) * 0.03
                put(L, st, clap); put(R, st, clap); put(REV, st, clap * 1.5)
    if 3 <= bar <= FULL:   # шейкер шестнадцатыми
        for i in range(16):
            n = int(0.04 * SR); t = np.arange(n) / SR
            acc = 1.0 if i % 2 else 0.55
            sh = np.diff(rng.standard_normal(n + 1)) * np.exp(-t / 0.012) * 0.009 * acc
            put(L if i % 4 < 2 else R, t0 + i * BEAT / 4, sh)

# нарастающий шум к логотипу (последние 1,4 с перед 5-м тактом)
st, en = 4 * BAR - 1.4, 4 * BAR
n = int((en - st) * SR); t = np.arange(n) / SR
nz = np.cumsum(rng.standard_normal(n)); nz -= np.convolve(nz, np.ones(64) / 64, 'same')
riser = nz / (np.abs(nz).max() + 1e-9) * (t / t[-1]) ** 2.2 * 0.06
put(L, st, riser); put(R, st, riser); put(REV, st, riser)

# реверберация: свёртка с затухающим шумом (2 с), разной для каналов
n = int(2.0 * SR); t = np.arange(n) / SR
for side in (L, R):
    ir = rng.standard_normal(n) * np.exp(-t / 0.45)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(N + n)))
    wet = np.fft.irfft(np.fft.rfft(REV, size) * np.fft.rfft(ir, size), size)[:N]
    side += 0.55 * wet

# лёгкая «качель» громкости от бочки (как сайдчейн), затухание в конце, нормировка
t = np.arange(N) / SR
pump = np.ones(N)
k = (t >= 4 * BAR) & (t < FULL * BAR)
ph = ((t - 4 * BAR) % BEAT) / BEAT
pump[k] = 1 - 0.18 * np.exp(-ph[k] / 0.18)
fade = np.clip((DUR - t) / 2.0, 0, 1)
fade_in = np.clip(t / 0.6, 0, 1)
mix = np.stack([L, R], 1) * (pump * fade * fade_in)[:, None]
mix = mix[: int(DUR * SR)]
mix /= np.abs(mix).max()
mix = np.tanh(mix * 1.5) / np.tanh(1.5) * 0.89      # мягкое ограничение пиков, пик −1 дБ

with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(OUT, f'{DUR:.1f} с')
