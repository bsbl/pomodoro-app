// Renders the tomato tray icon with an optional progress ring (depletes clockwise as
// the session's remaining time decreases), using tiny-skia.

use image::GenericImageView;
use std::sync::OnceLock;
use tiny_skia::{Paint, PathBuilder, Pixmap, Stroke, Transform};

const SIZE: u32 = 128;
const CENTER: f32 = SIZE as f32 / 2.0;
const RING_RADIUS: f32 = 56.0;
const RING_WIDTH: f32 = 12.0;
// Box the tomato is fitted into: the whole icon when there's no ring,
// just inside the ring's inner edge otherwise.
const TOMATO_SIZE_FULL: u32 = SIZE - 4;
const TOMATO_SIZE_IN_RING: u32 = (2.0 * (RING_RADIUS - RING_WIDTH / 2.0)) as u32 - 4;

static TOMATO_FULL: OnceLock<Pixmap> = OnceLock::new();
static TOMATO_IN_RING: OnceLock<Pixmap> = OnceLock::new();

/// Decodes the tomato PNG, crops away its transparent padding, and scales
/// it (keeping its aspect ratio) to fit a `box_size` square.
fn load_tomato(tomato_png_bytes: &[u8], box_size: u32) -> Pixmap {
    let mut img = image::load_from_memory(tomato_png_bytes)
        .expect("bundled tray tomato icon must be a valid PNG")
        .to_rgba8();

    let (mut min_x, mut min_y, mut max_x, mut max_y) = (img.width(), img.height(), 0, 0);
    for (x, y, pixel) in img.enumerate_pixels() {
        if pixel.0[3] > 8 {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }
    let img = if min_x <= max_x && min_y <= max_y {
        image::imageops::crop(&mut img, min_x, min_y, max_x - min_x + 1, max_y - min_y + 1).to_image()
    } else {
        img
    };

    let img = image::DynamicImage::ImageRgba8(img).resize(
        box_size,
        box_size,
        image::imageops::FilterType::Lanczos3,
    );
    let (width, height) = img.dimensions();
    let mut pixmap = Pixmap::new(width, height).unwrap();
    for (x, y, pixel) in img.pixels() {
        let [r, g, b, a] = pixel.0;
        // tiny-skia stores premultiplied alpha internally.
        let af = a as f32 / 255.0;
        let idx = (y * width + x) as usize;
        pixmap.pixels_mut()[idx] = tiny_skia::PremultipliedColorU8::from_rgba(
            (r as f32 * af).round() as u8,
            (g as f32 * af).round() as u8,
            (b as f32 * af).round() as u8,
            a,
        )
        .unwrap();
    }
    pixmap
}

fn arc_path(cx: f32, cy: f32, radius: f32, start_angle: f32, end_angle: f32) -> tiny_skia::Path {
    const SEGMENTS: usize = 128;
    let mut pb = PathBuilder::new();
    for i in 0..=SEGMENTS {
        let t = i as f32 / SEGMENTS as f32;
        let angle = start_angle + (end_angle - start_angle) * t;
        let x = cx + radius * angle.cos();
        let y = cy + radius * angle.sin();
        if i == 0 {
            pb.move_to(x, y);
        } else {
            pb.line_to(x, y);
        }
    }
    pb.finish().unwrap()
}

/// Renders the tray icon and returns raw straight-alpha RGBA8 bytes
/// (SIZE x SIZE). `fraction` is remaining/total in [0, 1] (1 = full ring,
/// just started; 0 = empty, about to end). `accent_color` is (r, g, b).
/// `show_ring = false` draws the plain tomato (idle/alerting states).
pub fn render_tray_icon(
    fraction: f64,
    accent_color: (u8, u8, u8),
    show_ring: bool,
    tomato_png_bytes: &[u8],
) -> Vec<u8> {
    let mut pixmap = Pixmap::new(SIZE, SIZE).unwrap();

    if show_ring {
        // Background ring (unfilled track).
        let bg_path = arc_path(CENTER, CENTER, RING_RADIUS, 0.0, std::f32::consts::TAU);
        let mut bg_paint = Paint::default();
        bg_paint.set_color_rgba8(0, 0, 0, 46); // ~0.18 alpha
        let stroke = Stroke { width: RING_WIDTH, ..Default::default() };
        pixmap.stroke_path(&bg_path, &bg_paint, &stroke, Transform::identity(), None);

        // Progress arc, starting at 12 o'clock, same start/end-angle math
        // as the original canvas version (y-down coordinates match):
        // the ring depletes clockwise as `fraction` decreases over time.
        let clamped = fraction.clamp(0.0, 1.0);
        if clamped > 0.0 {
            let start_angle = -std::f32::consts::FRAC_PI_2;
            let end_angle = start_angle - (clamped as f32) * std::f32::consts::TAU;
            let fg_path = arc_path(CENTER, CENTER, RING_RADIUS, start_angle, end_angle);
            let mut fg_paint = Paint::default();
            fg_paint.set_color_rgba8(accent_color.0, accent_color.1, accent_color.2, 255);
            fg_paint.anti_alias = true;
            let stroke = Stroke { width: RING_WIDTH, line_cap: tiny_skia::LineCap::Round, ..Default::default() };
            pixmap.stroke_path(&fg_path, &fg_paint, &stroke, Transform::identity(), None);
        }
    }

    let tomato = if show_ring {
        TOMATO_IN_RING.get_or_init(|| load_tomato(tomato_png_bytes, TOMATO_SIZE_IN_RING))
    } else {
        TOMATO_FULL.get_or_init(|| load_tomato(tomato_png_bytes, TOMATO_SIZE_FULL))
    };
    pixmap.draw_pixmap(
        ((SIZE - tomato.width()) / 2) as i32,
        ((SIZE - tomato.height()) / 2) as i32,
        tomato.as_ref(),
        &tiny_skia::PixmapPaint::default(),
        Transform::identity(),
        None,
    );

    // tiny-skia's pixel buffer is premultiplied alpha; convert back to
    // straight alpha, which is what Tauri's Image::new expects.
    let mut out = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for px in pixmap.pixels() {
        let a = px.alpha();
        if a == 0 {
            out.extend_from_slice(&[0, 0, 0, 0]);
        } else {
            let unmul = |c: u8| ((c as u32 * 255) / a as u32).min(255) as u8;
            out.push(unmul(px.red()));
            out.push(unmul(px.green()));
            out.push(unmul(px.blue()));
            out.push(a);
        }
    }
    out
}
