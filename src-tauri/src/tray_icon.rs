// Renders the tomato tray icon with an optional progress ring (depletes clockwise as
// the session's remaining time decreases), using tiny-skia.

use image::GenericImageView;
use std::sync::OnceLock;
use tiny_skia::{Paint, PathBuilder, Pixmap, Stroke, Transform};

const SIZE: u32 = 128;
const CENTER: f32 = SIZE as f32 / 2.0;
const RING_RADIUS: f32 = 56.0;
const RING_WIDTH: f32 = 12.0;
const TOMATO_SIZE: u32 = 84; // leaves room for the ring around it

static TOMATO: OnceLock<Pixmap> = OnceLock::new();

fn tomato_pixmap(tomato_png_bytes: &[u8]) -> &'static Pixmap {
    TOMATO.get_or_init(|| {
        let img = image::load_from_memory(tomato_png_bytes)
            .expect("bundled tray tomato icon must be a valid PNG")
            .resize_exact(TOMATO_SIZE, TOMATO_SIZE, image::imageops::FilterType::Lanczos3);
        let mut pixmap = Pixmap::new(TOMATO_SIZE, TOMATO_SIZE).unwrap();
        for (x, y, pixel) in img.pixels() {
            let [r, g, b, a] = pixel.0;
            // tiny-skia stores premultiplied alpha internally.
            let af = a as f32 / 255.0;
            let idx = (y * TOMATO_SIZE + x) as usize;
            pixmap.pixels_mut()[idx] = tiny_skia::PremultipliedColorU8::from_rgba(
                (r as f32 * af).round() as u8,
                (g as f32 * af).round() as u8,
                (b as f32 * af).round() as u8,
                a,
            )
            .unwrap();
        }
        pixmap
    })
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

    let tomato = tomato_pixmap(tomato_png_bytes);
    let offset = ((SIZE - TOMATO_SIZE) / 2) as i32;
    pixmap.draw_pixmap(
        offset,
        offset,
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
