"""Run Tessera-small (16x16 pixel-art sprites from text) with onnxruntime.

    pip install onnxruntime numpy pillow tokenizers huggingface_hub
    python tessera_onnx.py "rubber duck" --out duck.png

Or from Python:

    from tessera_onnx import Tessera
    tessera = Tessera.load()
    for i, sprite in enumerate(tessera.generate("rubber duck", seed=0)):
        sprite.resize((128, 128), Image.NEAREST).save(f"duck-{i}.png")

https://huggingface.co/cfahlgren1/tessera-small-onnx
"""

from __future__ import annotations

import argparse
import json
import math
import re

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image
from tokenizers import Tokenizer

REPO_ID = "cfahlgren1/tessera-small-onnx"
GRID = 16
N = GRID * GRID
K = 512  # palette size
MASK = 512  # token id for "not painted yet"
TEXT_LEN = 24


class Tessera:
    def __init__(self, denoiser: ort.InferenceSession, text_encoder: ort.InferenceSession, tokenizer: Tokenizer, palette: np.ndarray):
        self.denoiser = denoiser
        self.text_encoder = text_encoder
        self.tokenizer = tokenizer
        self.palette = palette  # (512, 4) uint8 RGBA, index 0 is transparent

    @classmethod
    def load(cls, repo_id: str = REPO_ID, revision: str | None = None, providers: list[str] | None = None) -> "Tessera":
        """Download the model files from the Hub (cached) and open ONNX sessions."""
        path = lambda name: hf_hub_download(repo_id, name, revision=revision)
        providers = providers or ["CPUExecutionProvider"]
        palette = np.array(json.load(open(path("palette.json")))["palette_rgba"], dtype=np.uint8)
        return cls(
            denoiser=ort.InferenceSession(path("tessera_w8.onnx"), providers=providers),
            text_encoder=ort.InferenceSession(path("clip_text_w8.onnx"), providers=providers),
            tokenizer=Tokenizer.from_file(path("tokenizer.json")),
            palette=palette,
        )

    def encode_text(self, prompt: str) -> tuple[np.ndarray, np.ndarray]:
        """CLIP ids padded to 24 with EOS (BOS and EOS come from the tokenizer's post-processor)."""
        ids = self.tokenizer.encode(re.sub(r"\s+", " ", prompt)).ids
        eos = ids[-1]
        if len(ids) > TEXT_LEN:
            ids = ids[: TEXT_LEN - 1] + [eos]
        ids = ids + [eos] * (TEXT_LEN - len(ids))
        states, pooled = self.text_encoder.run(
            ["last_hidden_state", "pooler_output"], {"input_ids": np.array([ids], dtype=np.int64)}
        )
        return states, pooled

    def generate(self, prompt: str, count: int = 4, seed: int | None = None, steps: int = 16, guidance: float = 3.0) -> list[Image.Image]:
        """Paint `count` 16x16 RGBA sprites with the masked-diffusion sampler (cosine schedule,
        classifier-free guidance, confidence-ordered unmasking with Gumbel noise and spatial NMS)."""
        tokens = self.generate_tokens(prompt, count=count, seed=seed, steps=steps, guidance=guidance)
        return [Image.fromarray(self.palette[t].reshape(GRID, GRID, 4), "RGBA") for t in tokens]

    def generate_tokens(self, prompt: str, count: int = 4, seed: int | None = None, steps: int = 16, guidance: float = 3.0) -> np.ndarray:
        """Like generate(), but returns palette indices, shape (count, 256)."""
        choice_temperature = 2.0
        nms_threshold = 0.9
        n = count
        rng = np.random.default_rng(seed)
        states, pooled = self.encode_text(prompt)
        b2 = n * 2  # a conditional and an unconditional row per sprite
        text_states = np.repeat(states, b2, axis=0).astype(np.float32)
        text_pooled = np.repeat(pooled, b2, axis=0).astype(np.float32)
        drop_text = np.array([False] * n + [True] * n)

        x = np.full((n, N), MASK, dtype=np.int64)
        masked = np.ones((n, N), dtype=bool)
        sc = np.zeros((b2, N, K), dtype=np.float32)

        for k in range(steps):
            frac = (k + 1) / steps
            ratio = masked.mean(axis=1).astype(np.float32)
            logits = self.denoiser.run(None, {
                "x": np.concatenate([x, x]),
                "text_states": text_states,
                "text_pooled": text_pooled,
                "mask_ratio": np.concatenate([ratio, ratio]),
                "sc_probs": sc,
                "drop_text": drop_text,
            })[0]
            if not np.isfinite(logits).all():
                raise RuntimeError("The model returned NaN or infinite logits.")

            # Classifier-free guidance, softmax, and one categorical sample per pixel.
            cond, uncond = logits[:n], logits[n:]
            guided = uncond + guidance * (cond - uncond)
            guided -= guided.max(axis=-1, keepdims=True)
            probs = np.exp(guided)
            probs /= probs.sum(axis=-1, keepdims=True)
            u = rng.random((n, N, 1))
            sampled = np.minimum((np.cumsum(probs, axis=-1) < u).sum(axis=-1), K - 1)
            p_sel = np.take_along_axis(probs, sampled[..., None], axis=-1)[..., 0]

            remaining = 0 if k == steps - 1 else math.floor(N * math.cos(math.pi / 2 * frac))
            for b in range(n):
                n_masked = int(masked[b].sum())
                n_commit = min(max(n_masked - remaining, 1), n_masked)
                if n_commit == 0:
                    continue
                # Confidence score with annealed Gumbel noise.
                gumbel = -np.log(-np.log(np.clip(rng.random(N), 1e-10, 1 - 1e-10)))
                score = np.log(np.maximum(p_sel[b], 1e-12)) + choice_temperature * (1 - frac) * gumbel

                # Spatial NMS: prefer certain pixels and local maxima among uncertain masked ones.
                certain = p_sel[b] >= nms_threshold
                contenders = np.where(masked[b] & ~certain, score, -np.inf).reshape(GRID, GRID)
                padded = np.pad(contenders, 1, constant_values=-np.inf)
                local_max = np.max([padded[1 + dr : 1 + dr + GRID, 1 + dc : 1 + dc + GRID] for dr in (-1, 0, 1) for dc in (-1, 0, 1)], axis=0)
                eligible = certain | (score >= local_max.reshape(N))

                key = np.where(masked[b], score + eligible * 1e4, -np.inf)
                chosen = np.argsort(-key, kind="stable")[:n_commit]
                x[b, chosen] = sampled[b, chosen]
                masked[b, chosen] = False

            # Self-conditioning: feed this step's guided distribution to both CFG rows.
            sc = np.concatenate([probs, probs]).astype(np.float32)
        return x


def main() -> None:
    parser = argparse.ArgumentParser(description="Make 16x16 pixel-art emoji from text.")
    parser.add_argument("prompt")
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--size", type=int, default=128, help="output size in px for each sprite (default 128, Slack's emoji size)")
    parser.add_argument("--out", default="tessera.png", help="where to save the variations, side by side")
    args = parser.parse_args()

    sprites = Tessera.load().generate(args.prompt, count=args.count, seed=args.seed)
    sheet = Image.new("RGBA", (args.size * len(sprites), args.size), (0, 0, 0, 0))
    for i, sprite in enumerate(sprites):
        sheet.paste(sprite.resize((args.size, args.size), Image.NEAREST), (i * args.size, 0))
    sheet.save(args.out)
    print(f"saved {len(sprites)} sprites to {args.out}")


if __name__ == "__main__":
    main()
