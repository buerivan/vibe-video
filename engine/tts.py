#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tts.py —— 为 config.json 的每个「有 caption 的镜头」生成 TTS 语音，
并把真实语音时长写回 shot.dur（反向对齐：画面跟随声音，消除人工长气口）。

依赖:
  edge-tts >= 7.3.1   (7.3.1 起含 v2 GEC token，修复 403 Invalid response status)
  ffmpeg              (优先用仓库 node_modules/ffmpeg-static/ffmpeg.exe，否则系统 PATH)

用法:
  python engine/tts.py --config scenes/<选题>/config.json
                        [--voice zh-CN-XiaoxiaoNeural]
                        [--proxy http://127.0.0.1:7897]   (--proxy none 关闭)
                        [--gap 0.15]                        (镜头间静音秒数，0=最紧)
                        [--out output/<选题>/voice]
                        [--no-write-config]                (只产语音+时间轴，不改 config)

产物:
  <out>/voice.mp3            全片对齐语音轨（按镜头顺序拼接，含每镜间 gap 静音）
  <out>/voice_timeline.json  每镜真实时长 {index,caption,dur}
  config.json 的 shot.dur    写回为真实时长（备份 config.before-voice.json）

流程衔接（之后照常跑）:
  node engine/serve.js --root scenes/<选题>
  node engine/shoot.js                       # 帧数 = 真实 dur × fps，画面跟随声音
  node engine/mksrt.js --config scenes/<选题>/config.json --out output/<选题>/subtitles.srt
  node engine/encode.js --audio <out>/voice.mp3 --sub output/<选题>/subtitles.srt
"""
import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys

# ---- 路径 ----
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))

BITRATE = 48000  # edge-tts 输出 audio-24khz-48kbitrate-mono-mp3 = 48kbps CBR


def find_ffmpeg():
    cands = [
        os.path.join(REPO, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
        os.path.join(REPO, "node_modules", "ffmpeg-static", "ffmpeg"),
        "ffmpeg",
    ]
    for p in cands:
        if os.path.exists(p):
            return p
    # 最后尝试 PATH
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    raise SystemExit("未找到 ffmpeg。请 npm i ffmpeg-static，或把 ffmpeg 加入 PATH。")


def strip_comments(text):
    """剥掉 config.json 里 AI 易写的 /* */ 与 // 注释（与 serve.js 一致）。"""
    return re.sub(r"/\*[\s\S]*?\*/", "", text)


def mp3_duration_cbr(path):
    """edge-tts 是 48kbps CBR，时长 = 字节数 × 8 / 比特率。精确且无需 ffprobe。"""
    size = os.path.getsize(path)
    return size * 8 / BITRATE


def make_silence(ffmpeg, seconds, out_path):
    """用 ffmpeg 生成一段 48kbps 单声道静音 mp3。"""
    if seconds <= 0:
        return None
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", f"{seconds:.3f}",
        "-c:a", "libmp3lame", "-b:a", "48k",
        out_path,
    ]
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0:
        raise RuntimeError(f"生成静音失败: {out_path}")
    return out_path


def concat(ffmpeg, seg_paths, out_path):
    """用 ffmpeg concat demuxer 无缝拼接（同为 48k CBR mp3，copy 不重编码）。"""
    list_path = out_path + ".list.txt"
    with open(list_path, "w", encoding="utf-8") as f:
        for p in seg_paths:
            f.write(f"file '{p.replace(chr(92), '/')}'\n")
    cmd = [
        ffmpeg, "-y", "-f", "concat", "-safe", "0",
        "-i", list_path, "-c", "copy", out_path,
    ]
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(list_path)
    if r.returncode != 0:
        raise RuntimeError(f"拼接语音失败: {out_path}")
    return out_path


async def synth_one(text, voice, proxy, out_path):
    import edge_tts  # 延迟导入，缺依赖时给出清晰报错
    comm = edge_tts.Communicate(text, voice, proxy=proxy)
    await comm.save(out_path)


def main():
    ap = argparse.ArgumentParser(description="为 vibe 知识视频生成对齐语音轨")
    ap.add_argument("--config", required=True, help="场景 config.json 路径")
    ap.add_argument("--voice", default="zh-CN-XiaoxiaoNeural", help="TTS 音色")
    ap.add_argument("--proxy", default="http://127.0.0.1:7897",
                    help="HTTP 代理（Clash 等）；--proxy none 关闭")
    ap.add_argument("--gap", type=float, default=0.15,
                    help="镜头间静音秒数，默认 0.15；0=最紧，消除长气口")
    ap.add_argument("--out", default=None, help="语音输出目录（默认 output/<选题>/voice）")
    ap.add_argument("--no-write-config", action="store_true",
                    help="只生成语音+时间轴，不写回 config.json 的 dur")
    args = ap.parse_args()

    proxy = None if args.proxy in ("none", "None", "") else args.proxy

    cfg_path = os.path.abspath(args.config)
    if not os.path.exists(cfg_path):
        raise SystemExit(f"找不到 config: {cfg_path}")
    cfg_dir = os.path.dirname(cfg_path)
    topic = os.path.basename(cfg_dir)
    out_dir = args.out or os.path.join(REPO, "output", topic, "voice")
    os.makedirs(out_dir, exist_ok=True)

    raw = open(cfg_path, encoding="utf-8").read()
    cfg = json.loads(strip_comments(raw))

    shots = cfg.get("shots", [])
    if not shots:
        raise SystemExit("config.json 里没有 shots")

    ffmpeg = find_ffmpeg()
    seg_paths = []
    timeline = []
    new_durs = []

    print(f"[tts] 选题: {topic}")
    print(f"[tts] 音色: {args.voice}  代理: {proxy or '无'}  gap: {args.gap}s")
    print(f"[tts] 输出: {out_dir}\n")

    for i, shot in enumerate(shots):
        caption = (shot.get("caption") or "").strip()
        orig_dur = shot.get("dur")
        idx = f"{i + 1:03d}"

        if not caption:
            # 无字幕镜：用原 dur 静音填充，保持音画对齐
            dur = float(orig_dur) if orig_dur else 3.0
            sil = make_silence(ffmpeg, dur, os.path.join(out_dir, f"seg_{idx}.mp3"))
            seg_paths.append(sil)
            new_durs.append(dur)
            timeline.append({"index": i, "caption": None, "dur": round(dur, 3)})
            print(f"  [{idx}] (无字幕) 静音 {dur:.2f}s")
            continue

        raw_mp3 = os.path.join(out_dir, f"raw_{idx}.mp3")
        try:
            asyncio.run(synth_one(caption, args.voice, proxy, raw_mp3))
        except Exception as e:
            raise SystemExit(f"  [{idx}] TTS 失败: {e}\n"
                             f"       检查代理/网络（Clash 需运行），或 edge-tts>=7.3.1")

        spoken = mp3_duration_cbr(raw_mp3)
        parts = [raw_mp3]
        if args.gap > 0:
            sil = make_silence(ffmpeg, args.gap,
                               os.path.join(out_dir, f"sil_{idx}.mp3"))
            parts.append(sil)
        seg = os.path.join(out_dir, f"seg_{idx}.mp3")
        if len(parts) == 1:
            shutil.copy(parts[0], seg)
        else:
            concat(ffmpeg, parts, seg)
        seg_paths.append(seg)

        dur = spoken + (args.gap if args.gap > 0 else 0.0)
        new_durs.append(dur)
        timeline.append({
            "index": i, "caption": caption, "dur": round(dur, 3),
            "spoken": round(spoken, 3), "gap": args.gap,
        })
        est = f"(原估 {orig_dur}s)" if orig_dur else ""
        print(f"  [{idx}] {spoken:.2f}s 语音 + {args.gap:.2f}s 间隔 = {dur:.2f}s  {est}")

    # 全片拼接
    voice_mp3 = os.path.join(out_dir, "voice.mp3")
    concat(ffmpeg, seg_paths, voice_mp3)
    total = sum(new_durs)
    size_kb = os.path.getsize(voice_mp3) / 1024

    meta = {
        "topic": topic,
        "voice": args.voice,
        "gap": args.gap,
        "proxy": proxy,
        "total_duration": round(total, 3),
        "voice_file": "voice.mp3",
        "shots": timeline,
    }
    with open(os.path.join(out_dir, "voice_timeline.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 写回 config.json 的 dur（反向对齐核心）
    if not args.no_write_config:
        bak = os.path.join(cfg_dir, "config.before-voice.json")
        if not os.path.exists(bak):
            shutil.copy(cfg_path, bak)
            print(f"\n[tts] 已备份原 config → {bak}")
        for i, shot in enumerate(shots):
            shot["dur"] = round(new_durs[i], 3)
        # 注意：写回会丢失 config 里的 /* */ 与 // 注释（JSON 不支持注释）
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"[tts] 已把真实时长写回 {os.path.relpath(cfg_path, REPO)} 的 shot.dur")
    else:
        print(f"[tts] --no-write-config：未改 config，仅产出语音+时间轴")

    print(f"\n[tts] ✅ 完成")
    print(f"      语音轨: {voice_mp3} ({size_kb:.0f} KB, 全片 {total:.1f}s)")
    print(f"      时间轴: {os.path.join(out_dir, 'voice_timeline.json')}")
    if not args.no_write_config:
        print(f"      后续:  node engine/serve.js --root {os.path.relpath(cfg_dir, REPO)}")
        print(f"             node engine/shoot.js")
        print(f"             node engine/mksrt.js --config {os.path.relpath(cfg_path, REPO)} --out output/{topic}/subtitles.srt")
        print(f"             node engine/encode.js --audio {os.path.relpath(voice_mp3, REPO)} --sub output/{topic}/subtitles.srt")


if __name__ == "__main__":
    main()
