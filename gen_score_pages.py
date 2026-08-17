import fitz, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = "/Users/jaychan/Documents/个人职业/陈俊 制谱作品集"
OUT_PAGES = "/Users/jaychan/Documents/GitHub/Jay-Chan-Introduction/images/scores/pages"
OUT_THUMBS = "/Users/jaychan/Documents/GitHub/Jay-Chan-Introduction/images/scores/thumbs"
os.makedirs(OUT_PAGES, exist_ok=True)
os.makedirs(OUT_THUMBS, exist_ok=True)

# (源文件名, slug, [3个页码(1-based)])
JOBS = [
    ("Shui Xiang Ji Yi.pdf", "silk-rain-willow-shadows", [3, 4, 5]),
    ("Deng Shan.pdf", "climbing-mountain", [3, 4, 5]),
    ("Mistbenders.pdf", "mistbenders", [3, 4, 5]),
    ("Yuan Su.pdf", "element", [3, 4, 5]),
    ("Green Tea Farm.pdf", "green-tea-farm", [1, 2, 3]),
    ("Bu You Ji.pdf", "buyouji", [1, 2, 3]),
    ("Xun Kong.pdf", "seek-void", [4, 5, 6]),
    ("Yao Wang.pdf", "yaowang", [1, 2, 3]),
    ("Wu Ze Tian.pdf", "wu-zetian", [1, 2, 3]),
]

FONT = None
for c in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
          "/System/Library/Fonts/Supplemental/Arial.ttf",
          "/System/Library/Fonts/Helvetica.ttc"]:
    if os.path.exists(c):
        FONT = c
        break

TEXT = "JayChan0822"
X_START = 0.20        # 文字笔画外框左边缘：页宽 20%
X_SPAN = 0.76         # 文字水平跨度：页宽 76%（终点 ~96%）
Y_TOP = 0.30          # 文字笔画外框上边缘（右上端）：页高 30%
INK = (150, 150, 150)
INK_ALPHA = 105       # 压在白纸上 ≈ 208 灰，和参考图一致

MASK_RGB = 255        # 纯白遮罩（完全盖住谱面）
MASK_BOTTOM_X = -0.15  # 斜边与页面底边交点（页宽比例，负值=过冲到左边缘外）——更左
MASK_RIGHT_Y = -0.15   # 斜边与页面右边缘交点（页高比例，负值=过冲到上边缘外）——更上
MASK_SAT_DIST = 0.42   # 斜边法向饱和距离（页高比例）：淡化过渡带更宽


def _smoothstep(x):
    return x * x * (3.0 - 2.0 * x)


def _gradient_mask(out):
    """右下角直角三角形遮罩：斜边从底边 10% 处斜向右边缘 10% 处（∥ 副对角线）。

    斜边右下方（朝右下角）为遮罩区：沿法向在 MASK_SAT_DIST 距离内从 0
    平滑过渡到纯白（淡化区宽），右下角完全盖住。左下角/右上角/左上角清晰。
    """
    W, H = out.size
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    xb = W * MASK_BOTTOM_X
    # 斜边：从 (xb, H) 出发，斜率 -H/W（与副对角线平行）
    y_line = H + (H / W) * (xb - xx)
    n = np.sqrt(1.0 + (H / W) ** 2)
    # 法向距离：斜边右下方（右下角方向）为正，左上方为负
    dist = (yy - y_line) / n
    sat = H * MASK_SAT_DIST
    t = np.clip(dist / sat, 0.0, 1.0)
    alpha = (_smoothstep(t) * 255).astype(np.uint8)

    ov = np.zeros((H, W, 4), dtype=np.uint8)
    ov[..., :3] = MASK_RGB
    ov[..., 3] = alpha
    out.alpha_composite(Image.fromarray(ov, "RGBA"), (0, 0))


def _render_rotated(fs, angle):
    """按字号 fs 渲染并旋转文字，裁到真实笔画范围后返回（便于按外框精确定位）。"""
    font = ImageFont.truetype(FONT, fs)
    l, t, r, b = font.getbbox(TEXT)
    pad = max(6, fs // 10)
    tmp = Image.new("RGBA", ((r - l) + 2 * pad, (b - t) + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((pad - l, pad - t), TEXT, font=font, fill=INK + (INK_ALPHA,))
    rot = tmp.rotate(angle, expand=True, resample=Image.BICUBIC)
    return rot.crop(rot.getbbox())


def _diagonal_text(out):
    """单个大号斜向水印文字（独立于遮罩），方向与遮罩斜边完全一致。

    角度动态取遮罩斜边夹角：atan((H - yr) / (W - xb))——竖版页 ≈ 54.7°，
    与斜边平行（都是左下→右上 "/" 方向）。字号用「渲染 → 量实际外框 →
    按比例修正」两轮反解直接命中目标宽度，再按笔画外框左上角落位。
    """
    W, H = out.size
    xb = W * MASK_BOTTOM_X
    yr = H * MASK_RIGHT_Y
    angle = math.degrees(math.atan((H - yr) / (W - xb)))
    target = W * X_SPAN

    fs = max(44, int(200 * target / _render_rotated(200, angle).width))
    for _ in range(3):                      # 收敛很快，两三轮即到 ±1px
        rot = _render_rotated(fs, angle)
        if abs(rot.width - target) <= 2:
            break
        fs = max(44, int(round(fs * target / rot.width)))
    rot = _render_rotated(fs, angle)

    px = int(W * X_START)
    py = min(int(H * Y_TOP), H - rot.height)   # 页面偏矮时上移，保证整串文字在页内

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(rot, (px, py), rot)          # paste 可裁剪越界部分，不会抛异常
    out.alpha_composite(layer)


def add_corner_watermark(img):
    """参考图效果：单个大号 / 方向斜跨水印 + 右下角独立渐变遮罩（两者互不影响）。"""
    out = img.convert("RGBA")
    _gradient_mask(out)
    _diagonal_text(out)
    return out.convert("RGB")

def save_atomic(im, path, quality, optimize):
    """写临时文件再 os.replace 覆盖：避免 iCloud dataless 占位文件导致的半成品/EDEADLK。"""
    tmp = path + ".tmp"
    im.save(tmp, "JPEG", quality=quality, optimize=optimize)
    os.replace(tmp, path)


total_big = 0
for src, slug, pages in JOBS:
    doc = fitz.open(os.path.join(SRC, src))
    for i, pnum in enumerate(pages, 1):
        page = doc[pnum - 1]
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        img = add_corner_watermark(img)
        big = os.path.join(OUT_PAGES, f"{slug}-p{i}.jpg")
        save_atomic(img, big, 82, optimize=False)
        total_big += os.path.getsize(big)
        nw = 400
        nh = round(img.height * nw / img.width)
        small = img.resize((nw, nh), Image.LANCZOS)
        save_atomic(small, os.path.join(OUT_THUMBS, f"{slug}-p{i}.jpg"), 80, optimize=True)
    doc.close()
    print(f"✓ {slug}  p{pages[0]}/{pages[1]}/{pages[2]}")

print(f"\n完成 27 页。大图总计 {total_big//1024}KB")
