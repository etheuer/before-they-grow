from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "icons"
OUTPUT.mkdir(parents=True, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

for size in (192, 512):
    image = Image.new("RGB", (size, size), "#F04E3E")
    draw = ImageDraw.Draw(image)
    inset = int(size * 0.075)
    draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=int(size * 0.21),
        fill="#F04E3E",
        outline="#F7ECDD",
        width=max(2, int(size * 0.018)),
    )
    heart_font = ImageFont.truetype(FONT, int(size * 0.44))
    quote_font = ImageFont.truetype(FONT, int(size * 0.16))
    draw.text(
        (size * 0.5, size * 0.47),
        "♥",
        font=heart_font,
        fill="#FFF9F0",
        anchor="mm",
    )
    draw.text(
        (size * 0.62, size * 0.69),
        "”",
        font=quote_font,
        fill="#1E1D1A",
        anchor="mm",
    )
    image.save(OUTPUT / f"icon-{size}.png", optimize=True)

print(f"Generated app icons in {OUTPUT}")
