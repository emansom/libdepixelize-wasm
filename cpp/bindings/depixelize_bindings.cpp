#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <depixelize/depixelize.h>
#include <2geom/pathvector.h>
#include <2geom/bezier-curve.h>
#include <double-conversion/double-to-string.h>
#include <string>
#include <cstdint>
#include <cstdio>
#include <cmath>
#include <cstring>

// Serialize coordinate as shortest string that roundtrips to the same double.
// Uses Grisu3 algorithm via double-conversion for maximum precision.
// Strips leading zero for (-1,1): ".5" not "0.5"
static void append_coord(std::string& out, double v) {
    static const double_conversion::DoubleToStringConverter conv(
        double_conversion::DoubleToStringConverter::UNIQUE_ZERO,
        "inf", "NaN", 'e', -6, 21, 0, 0);
    char buf[32];
    double_conversion::StringBuilder builder(buf, sizeof(buf));
    conv.ToShortest(v, &builder);
    const char* s = builder.Finalize();
    int n = static_cast<int>(strlen(s));

    // Strip leading zero for compactness: "0.5" → ".5", "-0.5" → "-.5"
    if (n >= 2 && s[0] == '0' && s[1] == '.') {
        out.append(s + 1, n - 1);
    } else if (n >= 3 && s[0] == '-' && s[1] == '0' && s[2] == '.') {
        out += '-';
        out.append(s + 2, n - 2);
    } else {
        out.append(s, n);
    }
}

// Minimal SVG path serializer using absolute commands, H/V shorthand, and Z closepath.
// Only handles LineSegment and QuadraticBezier (the only curve types
// libdepixelize produces).
static std::string path_to_svg(const Geom::PathVector& pv) {
    std::string out;
    out.reserve(256);

    for (const auto& path : pv) {
        Geom::Point ip = path.initialPoint();
        out += 'M';
        append_coord(out, ip[0]);
        out += ',';
        append_coord(out, ip[1]);

        for (const auto& curve : path) {
            if (auto* line = dynamic_cast<const Geom::LineSegment*>(&curve)) {
                Geom::Point sp = (*line)[0];
                Geom::Point ep = (*line)[1];

                if (std::abs(ep[1] - sp[1]) < 1e-6) {
                    out += 'H';
                    append_coord(out, ep[0]);
                } else if (std::abs(ep[0] - sp[0]) < 1e-6) {
                    out += 'V';
                    append_coord(out, ep[1]);
                } else {
                    out += 'L';
                    append_coord(out, ep[0]);
                    out += ',';
                    append_coord(out, ep[1]);
                }
            } else if (auto* quad = dynamic_cast<const Geom::QuadraticBezier*>(&curve)) {
                Geom::Point cp = (*quad)[1];
                Geom::Point ep = (*quad)[2];

                out += 'Q';
                append_coord(out, cp[0]);
                out += ',';
                append_coord(out, cp[1]);
                out += ' ';
                append_coord(out, ep[0]);
                out += ',';
                append_coord(out, ep[1]);
            }
        }

        out += 'Z';
    }
    return out;
}

// Convert RGBA to shortest hex color string.
// Uses 3-digit shorthand when possible: #ff0000 → #f00
static std::string rgba_to_hex(const uint8_t rgba[4]) {
    uint8_t r = rgba[0], g = rgba[1], b = rgba[2];
    char buf[8];
    if ((r >> 4) == (r & 0xF) && (g >> 4) == (g & 0xF) && (b >> 4) == (b & 0xF)) {
        snprintf(buf, sizeof(buf), "#%x%x%x", r & 0xF, g & 0xF, b & 0xF);
    } else {
        snprintf(buf, sizeof(buf), "#%02x%02x%02x", r, g, b);
    }
    return buf;
}

static std::string depixelize(
    uintptr_t pixels_ptr, int width, int height, int n_channels,
    double curves_multiplier, double islands_weight,
    double sparse_pixels_multiplier, int sparse_pixels_radius,
    bool optimize, int method
) {
    const uint8_t* pixels = reinterpret_cast<const uint8_t*>(pixels_ptr);

    Depixelize::Image image;
    image.pixels = pixels;
    image.width = width;
    image.height = height;
    image.n_channels = n_channels;
    image.rowstride = width * n_channels;

    Depixelize::Options options;
    options.curves_multiplier = curves_multiplier;
    options.islands_weight = static_cast<int>(islands_weight);
    options.sparse_pixels_multiplier = sparse_pixels_multiplier;
    options.sparse_pixels_radius = sparse_pixels_radius;
    options.optimize = optimize;

    Depixelize::Splines splines;
    switch (method) {
        case 1:
            splines = Depixelize::to_voronoi(image, options);
            break;
        case 2:
            splines = Depixelize::to_grouped_voronoi(image, options);
            break;
        case 3: {
            options.isometric_weight = 8;
            splines = Depixelize::to_isometric(image, options);
            break;
        }
        default:
            splines = Depixelize::to_splines(image, options);
            break;
    }

    // Build SVG — one <path> per polygon (never merge same-color paths,
    // as merging breaks holes with nonzero fill rule)
    std::string svg;
    svg.reserve(1024 + width * height * 20);

    svg += "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ";
    svg += std::to_string(splines.width());
    svg += ' ';
    svg += std::to_string(splines.height());
    svg += "\" width=\"";
    svg += std::to_string(splines.width());
    svg += "\" height=\"";
    svg += std::to_string(splines.height());
    svg += "\">\n<style>path,rect{shape-rendering:crispEdges}</style>\n";

    // Background pixel rects — gap prevention layer
    svg += "<g>\n";
    for (int y = 0; y < height; ++y) {
        int x = 0;
        while (x < width) {
            int base = (y * width + x) * n_channels;
            uint8_t r = pixels[base], g = pixels[base+1], b = pixels[base+2];
            uint8_t a = (n_channels >= 4) ? pixels[base+3] : 255;

            if (a == 0) { ++x; continue; }  // skip transparent

            int run_start = x;
            while (x < width) {
                int bi = (y * width + x) * n_channels;
                uint8_t qr = pixels[bi], qg = pixels[bi+1], qb = pixels[bi+2];
                uint8_t qa = (n_channels >= 4) ? pixels[bi+3] : 255;
                if (qr != r || qg != g || qb != b || qa != a) break;
                ++x;
            }

            uint8_t rgba[4] = {r, g, b, a};
            std::string hex = rgba_to_hex(rgba);

            // Square base rect — gap-free pixel coverage
            svg += "<rect x=\"";
            svg += std::to_string(run_start);
            svg += "\" y=\"";
            svg += std::to_string(y);
            svg += "\" width=\"";
            svg += std::to_string(x - run_start);
            svg += "\" height=\"1\" fill=\"";
            svg += hex;
            svg += "\"";
            if (a < 255) {
                char buf[32];
                int n = snprintf(buf, sizeof(buf), " fill-opacity=\"%g\"", a / 255.0);
                svg.append(buf, n);
            }
            svg += "/>\n";

            // Rounded rect — smooth edges where paths have sub-pixel gaps
            svg += "<rect x=\"";
            svg += std::to_string(run_start);
            svg += "\" y=\"";
            svg += std::to_string(y);
            svg += "\" width=\"";
            svg += std::to_string(x - run_start);
            svg += "\" height=\"1\" rx=\".5\" ry=\".5\" fill=\"";
            svg += hex;
            svg += "\"";
            if (a < 255) {
                char buf[32];
                int n = snprintf(buf, sizeof(buf), " fill-opacity=\"%g\"", a / 255.0);
                svg.append(buf, n);
            }
            svg += "/>\n";
        }
    }
    // Vertical pixel rects — complement horizontal rects at junctions
    for (int x = 0; x < width; ++x) {
        int y = 0;
        while (y < height) {
            int base = (y * width + x) * n_channels;
            uint8_t r = pixels[base], g = pixels[base+1], b = pixels[base+2];
            uint8_t a = (n_channels >= 4) ? pixels[base+3] : 255;

            if (a == 0) { ++y; continue; }

            int run_start = y;
            while (y < height) {
                int bi = (y * width + x) * n_channels;
                uint8_t qr = pixels[bi], qg = pixels[bi+1], qb = pixels[bi+2];
                uint8_t qa = (n_channels >= 4) ? pixels[bi+3] : 255;
                if (qr != r || qg != g || qb != b || qa != a) break;
                ++y;
            }

            uint8_t rgba[4] = {r, g, b, a};
            svg += "<rect x=\"";
            svg += std::to_string(x);
            svg += "\" y=\"";
            svg += std::to_string(run_start);
            svg += "\" width=\"1\" height=\"";
            svg += std::to_string(y - run_start);
            svg += "\" rx=\".5\" ry=\".5\" fill=\"";
            svg += rgba_to_hex(rgba);
            svg += "\"";
            if (a < 255) {
                char buf[32];
                int n = snprintf(buf, sizeof(buf), " fill-opacity=\"%g\"", a / 255.0);
                svg.append(buf, n);
            }
            svg += "/>\n";
        }
    }
    svg += "</g>\n";

    for (const auto& path : splines) {
        std::string d = path_to_svg(path.pathVector);
        if (d.empty()) continue;

        std::string hex = rgba_to_hex(path.rgba);
        double opacity = path.rgba[3] / 255.0;

        svg += "<path d=\"";
        svg += d;
        svg += "\" fill=\"";
        svg += hex;
        svg += '"';
        if (opacity < 1.0) {
            char buf[32];
            int n = snprintf(buf, sizeof(buf), " fill-opacity=\"%g\"", opacity);
            svg.append(buf, n);
        }
        svg += "/>\n";
    }

    svg += "</svg>\n";
    return svg;
}

static uintptr_t wasmMalloc(int size) {
    return reinterpret_cast<uintptr_t>(malloc(static_cast<size_t>(size)));
}

static void wasmFree(uintptr_t ptr) {
    free(reinterpret_cast<void*>(ptr));
}

EMSCRIPTEN_BINDINGS(depixelize_module) {
    emscripten::function("depixelize", &depixelize);
    emscripten::function("wasmMalloc", &wasmMalloc);
    emscripten::function("wasmFree", &wasmFree);
}
