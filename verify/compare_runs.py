"""Compare dev-server screenshots with standalone (file://) screenshots.

Also computes the WCAG contrast of the exploded CTA button from the standalone
crop. Prints a JSON summary; used as evidence in VERIFICATION.md.
"""
from PIL import Image
import numpy as np
import json
import os

SHOTS = os.path.join(os.path.dirname(__file__), "shots")

PAIRS = [
    ("01-initial-desktop-1440x900.png", "08-standalone-01-initial-desktop-1440x900.png"),
    ("02-exploded-1440x900.png", "08-standalone-02-exploded-1440x900.png"),
    ("03-theme-obsidian-graphite.png", "08-standalone-03-theme-obsidian-graphite.png"),
    ("04-theme-lunar-harvest.png", "08-standalone-04-theme-lunar-harvest.png"),
    ("05-theme-copper-alabaster.png", "08-standalone-05-theme-copper-alabaster.png"),
    ("06-mobile-390x844.png", "08-standalone-06-mobile-390x844.png"),
    ("07-desktop-1280x800.png", "08-standalone-07-desktop-1280x800.png"),
]

report = []
for dev_name, standalone_name in PAIRS:
    dev = np.asarray(Image.open(os.path.join(SHOTS, dev_name)).convert("RGB"), dtype=np.int16)
    standalone = np.asarray(Image.open(os.path.join(SHOTS, standalone_name)).convert("RGB"), dtype=np.int16)
    if dev.shape != standalone.shape:
        report.append({"dev": dev_name, "standalone": standalone_name, "error": "size mismatch", "devShape": dev.shape, "standaloneShape": standalone.shape})
        continue
    diff = np.abs(dev - standalone)
    significant = (diff.max(axis=2) > 8).mean() * 100
    report.append(
        {
            "dev": dev_name,
            "standalone": standalone_name,
            "size": f"{dev.shape[1]}x{dev.shape[0]}",
            "meanAbsDiff": round(float(diff.mean()), 3),
            "pixelsDiffOver8Pct": round(float(significant), 3),
        }
    )

# ---- WCAG contrast of the standalone exploded CTA -------------------------
def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance(rgb):
    r, g, b = srgb_to_lin(np.array(rgb, dtype=float))
    return float(0.2126 * r + 0.7152 * g + 0.0722 * b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


button = np.asarray(Image.open(os.path.join(SHOTS, "08-standalone-02e-btn-explode-contrast.png")).convert("RGB"), dtype=float)
flat = button.reshape(-1, 3)
lum = 0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]
text = np.median(flat[lum >= np.percentile(lum, 99.0)], axis=0)
bg = np.median(flat[(lum <= np.percentile(lum, 50.0)) & (lum >= np.percentile(lum, 10.0))], axis=0)
contrast_report = {
    "textRGB": [int(v) for v in text],
    "bgRGB": [int(v) for v in bg],
    "wcagContrast": round(contrast(text, bg), 2),
}

print(json.dumps({"devVsStandalone": report, "standaloneButtonContrast": contrast_report}, indent=2, ensure_ascii=False))
