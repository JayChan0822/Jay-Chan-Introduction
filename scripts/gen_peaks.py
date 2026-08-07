#!/usr/bin/env python3
"""离线预生成波形数据，让网页不必下载整首 mp3 才能画出波形。

输出 peaks.json：{ "<stem>": { "duration": 秒, "peaks": [min,max, min,max, ...] } }
每个 bucket 输出一对 (min, max)，和 BBC audiowaveform 的约定一致，
这样 WaveSurfer 渲染出来才是上下对称的波形，而不是只有上半边。
"""
import json, subprocess, pathlib, sys, urllib.request, array

BASE = "https://jaychan-website.oss-cn-hangzhou.aliyuncs.com/audio"
OUT = pathlib.Path(__file__).resolve().parent.parent / "peaks.json"
CACHE = pathlib.Path(__file__).resolve().parent / ".mp3-cache"
CACHE.mkdir(exist_ok=True)

STEMS = [
    "an_ye_zhu_guang", "da_jiang_hu_ming_sheng", "heng_jue",
    "que_qiao_xian", "hang_zhou_zhi_jiang", "su_zhou_nian",
    "shu_zhong_tian_fu", "qin_yun_bin_fen_zou_xin_chun",
    "tian_wen", "da_zhu_jiao", "ro_chou_ka", "shui_xiang_ji_yi",
    "shi_xu", "huang_yang_bian_dan",
]

BUCKETS = 400   # 波形柱子数：barWidth 2 + barGap 2，约 800px 宽最多用到 200 根，400 够用且有余量
SR = 8000       # 算包络用，8kHz 足够


def fetch(stem):
    p = CACHE / f"{stem}.mp3"
    if not p.exists():
        urllib.request.urlretrieve(f"{BASE}/{stem}.mp3", p)
    return p


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()), 3)


def peaks(path):
    """解码成单声道 16bit PCM，按 bucket 取 (min, max)。"""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path),
         "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True, check=True).stdout

    samples = array.array("h")
    samples.frombytes(raw[: len(raw) // 2 * 2])
    if not samples:
        return []

    n = len(samples)
    step = max(1, n // BUCKETS)
    out = []
    for i in range(0, n, step):
        chunk = samples[i:i + step]
        if not chunk:
            continue
        out.append(round(min(chunk) / 32768.0, 3))
        out.append(round(max(chunk) / 32768.0, 3))
    return out


data = {}
for stem in STEMS:
    try:
        p = fetch(stem)
        d, pk = duration(p), peaks(p)
        data[stem] = {"duration": d, "peaks": pk}
        mb = p.stat().st_size / 1048576
        print(f"  {stem:<32} {d:7.1f}s  原 mp3 {mb:5.1f} MB  ->  {len(pk)} 个采样点")
    except Exception as e:
        print(f"  !! {stem} 失败: {e}", file=sys.stderr)

OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
size = OUT.stat().st_size
total_mp3 = sum((CACHE / f"{s}.mp3").stat().st_size for s in STEMS if (CACHE / f"{s}.mp3").exists())
print(f"\npeaks.json = {size/1024:.1f} KB   （原本需先下载 {total_mp3/1048576:.0f} MB mp3 才画得出这些波形）")
