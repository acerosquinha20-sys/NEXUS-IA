"""Troca o ícone, a tela de abertura e as cores do app Android gerado pelo Capacitor.
Roda no GitHub Actions depois do 'npx cap add android'. Nunca derruba o build: cada passo tem try/except."""
import os, re, glob
from PIL import Image, ImageDraw

RES = "android/app/src/main/res"
SRC = Image.open("icon-source.png").convert("RGB")

def fit(size):
    return SRC.resize((size, size), Image.LANCZOS)

def step(name, fn):
    try:
        fn(); print("OK  ", name)
    except Exception as e:
        print("AVISO", name, "->", e)

def icons():
    dens = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
    for d, (leg, fg) in dens.items():
        folder = f"{RES}/mipmap-{d}"
        if not os.path.isdir(folder):
            continue
        fit(leg).save(f"{folder}/ic_launcher.png")
        r = fit(leg).convert("RGBA")
        mask = Image.new("L", (leg * 4, leg * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, leg * 4 - 1, leg * 4 - 1), fill=255)
        r.putalpha(mask.resize((leg, leg), Image.LANCZOS))
        r.save(f"{folder}/ic_launcher_round.png")
        canvas = Image.new("RGBA", (fg, fg), (0, 0, 0, 0))
        inner = int(fg * 0.66)
        canvas.paste(fit(inner), ((fg - inner) // 2, (fg - inner) // 2))
        canvas.save(f"{folder}/ic_launcher_foreground.png")
    os.makedirs(f"{RES}/values", exist_ok=True)
    with open(f"{RES}/values/ic_launcher_background.xml", "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n')

def splash():
    for p in glob.glob(f"{RES}/drawable*/splash.png"):
        w, h = Image.open(p).size
        img = Image.new("RGB", (w, h), (0, 0, 0))
        s = int(min(w, h) * 0.42)
        img.paste(fit(s), ((w - s) // 2, (h - s) // 2))
        img.save(p)

def theme():
    p = f"{RES}/values/styles.xml"
    xml = open(p, encoding="utf-8").read()
    def add(style_regex, item):
        nonlocal xml
        m = re.search(r'(<style name="' + style_regex + r'"[^>]*>)', xml)
        if m and item.split('"')[1] not in xml[m.end(): xml.find("</style>", m.end())]:
            xml = xml[: m.end()] + "\n        " + item + xml[m.end():]
    for st in ("AppTheme.NoActionBar", "AppTheme"):
        add(re.escape(st), '<item name="android:statusBarColor">#000000</item>')
        add(re.escape(st), '<item name="android:navigationBarColor">#000000</item>')
        add(re.escape(st), '<item name="android:windowBackground">#000000</item>')
    m = re.search(r'<style name="AppTheme.NoActionBarLaunch" parent="([^"]*)"', xml)
    if m and "SplashScreen" in m.group(1):
        add(r"AppTheme\.NoActionBarLaunch", '<item name="windowSplashScreenBackground">#000000</item>')
    open(p, "w", encoding="utf-8").write(xml)

step("icones", icons)
step("splash", splash)
step("tema escuro", theme)
