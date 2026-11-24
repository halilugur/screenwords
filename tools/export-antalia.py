#!/usr/bin/env python3
"""Antalia-2 Mini (cloud0day3/antalia-mini, Apache-2.0) as ONNX graphs and data files for `tts-models/antalia`.

A one-time conversion; screenwords runs the graphs with ONNX Runtime and never needs Python. The release ships
PyTorch weights only, so the model is exported here, split where screenwords drives the loop:

- `encoder`: ids [1, L] -> h [1, L, 192] (text features), logdur [1, L] (log frames per symbol).
- `cond`: cond [1, T, 192] (each frame's symbol feature; T even, an odd count repeating the last symbol once
  more, as the package does) -> ctok and cnull [1, T/2, 192]: the generator's condition per token of two frames,
  and the same for the null condition that classifier-free guidance compares against.
- `flow`: one guided step of the flow: x [1, N, 256] at time t [1] with step size d [1], ctok, cnull, cfg [] ->
  v [1, N, 256] = vc + (cfg - 1) (vc - vu).
- `vocoder`: mel [1, 128, T] (log-mel, 93.75 Hz) -> audio [1, 512 T] at 48 kHz. The Vocos head's inverse STFT
  (n_fft 2048, hop 512, Hann, centred) is written as an inverse-DFT ConvTranspose1d with the window-square
  envelope, since ONNX has no ISTFT operator.

Beside them: `config.json` (the release config: symbols, sampling defaults, options, EQ), and the normaliser's
data, copied from the packages: `lexicon.json` and `tr_vocab.json` (antalia_mini, Apache-2.0) and `cmudict.dict`
(the CMU Pronouncing Dictionary, BSD-style licence, with its `cmudict.LICENSE`).

    uv venv -p 3.11 venv
    VIRTUAL_ENV=venv uv pip install torch antalia-mini onnx "onnxruntime==1.22.0"
    venv/bin/python tools/export-antalia.py RELEASE_DIR tts-models/antalia

RELEASE_DIR holds cloud0day3/antalia-mini (config.json, acoustic.safetensors, vocoder.safetensors).
"""

import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F


def export(module, args, out: Path, inputs, outputs, dynamic):
    with torch.no_grad():
        torch.onnx.export(module, args, str(out), input_names=inputs, output_names=outputs, opset_version=17,
                          dynamic_axes=dynamic, dynamo=False)
    print("exported", out.name, flush=True)


class Encoder(torch.nn.Module):
    def __init__(self, am):
        super().__init__()
        self.am = am

    def forward(self, ids):
        mask = torch.ones_like(ids, dtype=torch.bool)
        h = self.am.encoder(ids, mask)
        return h, self.am.duration(h, mask)


class Cond(torch.nn.Module):
    def __init__(self, am):
        super().__init__()
        self.g = am.generator

    def forward(self, cond):
        m = torch.ones(cond.shape[:2], dtype=torch.bool)
        return self.g.prep_cond(cond, m), self.g.prep_cond(self.g.null_cond.expand_as(cond), m)


class Flow(torch.nn.Module):
    def __init__(self, am):
        super().__init__()
        self.g = am.generator

    def forward(self, x, t, d, ctok, cnull, cfg):
        tmask = torch.ones(2, x.shape[1], dtype=torch.bool)
        v = self.g(torch.cat([x, x]), torch.cat([t, t]), torch.cat([d, d]), torch.cat([ctok, cnull]), tmask)
        vc, vu = v.chunk(2)
        return vc + (cfg - 1.0) * (vc - vu)


class Vocoder(torch.nn.Module):
    """The Vocos generator up to its head, then istft(center=True) as overlap-added inverse DFT frames."""

    def __init__(self, voc):
        super().__init__()
        self.voc = voc
        n, hop = voc.c.n_fft, voc.c.hop
        self.n, self.hop = n, hop
        k = torch.arange(n // 2 + 1, dtype=torch.float64)[:, None]
        t = torch.arange(n, dtype=torch.float64)[None, :]
        scale = torch.full((n // 2 + 1, 1), 2.0, dtype=torch.float64)
        scale[0] = scale[-1] = 1.0  # DC and Nyquist appear once in the full spectrum
        w = torch.hann_window(n, dtype=torch.float64)
        ang = 2 * math.pi * k * t / n
        basis = torch.cat([scale * torch.cos(ang), -scale * torch.sin(ang)]) / n * w  # [2 (n/2+1), n]
        self.register_buffer("basis", basis[:, None, :].float())
        self.register_buffer("wsq", (w ** 2)[None, None, :].float())

    def forward(self, mel):
        v = self.voc
        x = v.inp(mel)
        x = v.norm0(x.transpose(1, 2)).transpose(1, 2)
        for b in v.blocks:
            x = b(x)
        x = v.head(v.norm1(x.transpose(1, 2))).transpose(1, 2)
        logmag, ph = x.chunk(2, 1)
        mag = torch.exp(logmag).clamp(max=1e2)
        spec = torch.cat([mag * torch.cos(ph), mag * torch.sin(ph)], 1)  # [1, 2 (n/2+1), T]
        frames = spec.shape[2]
        y = F.conv_transpose1d(spec, self.basis, stride=self.hop)
        env = F.conv_transpose1d(torch.ones(1, 1, frames), self.wsq, stride=self.hop)
        y = y / torch.where(env > 1e-11, env, torch.ones_like(env))
        half = self.n // 2
        y = y[:, 0, half: half + (frames - 1) * self.hop]
        return F.pad(y, (0, self.hop))


def check(am, voc, out: Path):
    """Each graph against the PyTorch module it came from."""
    import onnxruntime as ort
    from antalia_mini.text import encode, to_model_text

    def run(name, **feeds):
        s = ort.InferenceSession(str(out / name), providers=["CPUExecutionProvider"])
        return s.run(None, {k: np.asarray(v) for k, v in feeds.items()})

    diff = lambda a, b: float(np.abs(np.asarray(a) - np.asarray(b).astype(np.float32)).max())
    g = torch.Generator().manual_seed(0)
    with torch.no_grad():
        ids = torch.tensor([encode(to_model_text("Merhaba, bugün hava çok güzel."))])
        h, logd = Encoder(am)(ids)
        got = run("encoder.onnx", ids=ids.numpy())
        print("encoder (h, logdur)", diff(got[0], h), diff(got[1], logd))
        T = 40
        cond = torch.randn(1, T, h.shape[2], generator=g)
        ref = Cond(am)(cond)
        got = run("cond.onnx", cond=cond.numpy())
        print("cond (ctok, cnull)", diff(got[0], ref[0]), diff(got[1], ref[1]))
        x = torch.randn(1, T // 2, 256, generator=g)
        args = (x, torch.tensor([0.25]), torch.tensor([0.125]), ref[0], ref[1], torch.tensor(2.0))
        got = run("flow.onnx", x=x.numpy(), t=args[1].numpy(), d=args[2].numpy(), ctok=ref[0].numpy(),
                  cnull=ref[1].numpy(), cfg=args[5].numpy())
        print("flow", diff(got[0], Flow(am)(*args)))
        mel = torch.randn(1, 128, 60, generator=g) * 2.6 - 5.9
        got = run("vocoder.onnx", mel=mel.numpy())
        print("vocoder vs torch.istft", diff(got[0], voc(mel)))


def main():
    from antalia_mini.weights import load_release

    release, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    am, voc, config = load_release(release, "fp32")
    am, voc = am.float().eval(), voc.float().eval()
    d = am.c.d_text
    seq = {1: "seq"}
    export(Encoder(am).eval(), (torch.tensor([[1, 12, 13, 2]]),), out / "encoder.onnx", ["ids"], ["h", "logdur"],
           {"ids": seq, "h": seq, "logdur": seq})
    export(Cond(am).eval(), (torch.randn(1, 8, d),), out / "cond.onnx", ["cond"], ["ctok", "cnull"],
           {"cond": seq, "ctok": seq, "cnull": seq})
    export(Flow(am).eval(), (torch.randn(1, 4, 256), torch.tensor([0.0]), torch.tensor([0.125]), torch.randn(1, 4, d),
                             torch.randn(1, 4, d), torch.tensor(2.0)), out / "flow.onnx",
           ["x", "t", "d", "ctok", "cnull", "cfg"], ["v"],
           {"x": seq, "ctok": seq, "cnull": seq, "v": seq})
    export(Vocoder(voc).eval(), (torch.randn(1, 128, 24),), out / "vocoder.onnx", ["mel"], ["audio"],
           {"mel": {2: "frames"}, "audio": {1: "samples"}})
    check(am, voc, out)
    (out / "config.json").write_text(json.dumps(config, ensure_ascii=False, indent=1), encoding="utf-8")
    import antalia_mini.text as text
    import cmudict

    data = Path(text.__file__).with_name("data")
    for name in ("lexicon.json", "tr_vocab.json"):
        shutil.copy(data / name, out / name)
    cmu = Path(cmudict.__file__).with_name("data")
    shutil.copy(cmu / "cmudict.dict", out / "cmudict.dict")
    shutil.copy(cmu / "LICENSE", out / "cmudict.LICENSE")
    print("wrote", out, flush=True)


if __name__ == "__main__":
    main()
