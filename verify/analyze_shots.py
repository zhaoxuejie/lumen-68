"""QA visual analysis helpers: WCAG contrast of the exploded button crop and
zoomed crops of the config summary for legibility review."""
from PIL import Image
import numpy as np
import os

SHOTS = os.path.join(os.path.dirname(__file__), "shots")


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


# ---- 1. exploded main button contrast -------------------------------------
button = Image.open(os.path.join(SHOTS, "02e-btn-explode-contrast.png")).convert("RGB")
arr = np.asarray(button).astype(float)
# background: dark copper pixels; text: bright cream pixels
flat = arr.reshape(-1, 3)
lum = 0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]
text_pixels = flat[lum >= np.percentile(lum, 99.0)]
bg_pixels = flat[(lum <= np.percentile(lum, 50.0)) & (lum >= np.percentile(lum, 10.0))]
text_med = np.median(text_pixels, axis=0)
bg_med = np.median(bg_pixels, axis=0)
print("button crop size:", button.size)
print("text median RGB:", [int(v) for v in text_med])
print("bg median RGB  :", [int(v) for v in bg_med])
print("WCAG contrast (median text vs median bg): %.2f:1" % contrast(text_med, bg_med))
print("WCAG contrast (brightest 1%% vs darkest 50%%): %.2f:1"
      % contrast(np.percentile(flat, 99.5, axis=0), np.percentile(flat, 25, axis=0)))

# ---- 2. zoomed config-summary crop for legibility -------------------------
for name, box, out in [
    ("01-initial-desktop-1440x900.png", (1045, 395, 1408, 475), "analysis-summary-01.png"),
    ("03-theme-obsidian-graphite.png", (1045, 395, 1408, 475), "analysis-summary-03.png"),
]:
    image = Image.open(os.path.join(SHOTS, name)).convert("RGB")
    crop = image.crop(box)
    crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
    crop.save(os.path.join(SHOTS, out))
    print("wrote", out, crop.size)

# ---- 3. mobile viewport product fill ratio --------------------------------
mobile = Image.open(os.path.join(SHOTS, "06-mobile-390x844.png")).convert("RGB")
arr = np.asarray(mobile).astype(float)
# rough product mask: pixels notably brighter than the dark stage inside the
# viewport strip (y 300..690)
strip = arr[300:690, 16:374]
lum = 0.2126 * strip[:, :, 0] + 0.7152 * strip[:, :, 1] + 0.0722 * strip[:, :, 2]
mask = lum > 60
ys, xs = np.where(mask)
if len(xs):
    print("mobile product bbox within strip: x %d..%d (of 358), y %d..%d (of 390), fill ratio %.2f"
          % (xs.min(), xs.max(), ys.min(), ys.max(),
             (xs.max() - xs.min()) * (ys.max() - ys.min()) / (358 * 390)))
