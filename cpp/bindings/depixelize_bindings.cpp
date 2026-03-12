#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <depixelize/depixelize.h>
#include <2geom/pathvector.h>
#include <2geom/bezier-curve.h>
#include <string>
#include <cstdint>
#include <cstdio>
#include <cmath>

// Append a coordinate as the shortest possible string with ≤4 decimal places.
// - Integers without decimal: "1" not "1.0"
// - Strip trailing zeros: ".5" not ".50"
// - Strip leading zero for (-1,1): ".5" not "0.5", "-.5" not "-0.5"
static void append_coord(std::string& out, double v) {
    double rounded = std::round(v * 10000.0) / 10000.0;
    int iv = static_cast<int>(rounded);
    if (rounded == static_cast<double>(iv)) {
        char buf[16];
        int n = snprintf(buf, sizeof(buf), "%d", iv);
        out.append(buf, n);
        return;
    }
    char buf[24];
    int n = snprintf(buf, sizeof(buf), "%.4f", rounded);
    while (n > 0 && buf[n-1] == '0') n--;
    if (n > 0 && buf[n-1] == '.') n--;
    if (n >= 2 && buf[0] == '0' && buf[1] == '.') {
        out.append(buf + 1, n - 1);
    } else if (n >= 3 && buf[0] == '-' && buf[1] == '0' && buf[2] == '.') {
        out += '-';
        out.append(buf + 2, n - 2);
    } else {
        out.append(buf, n);
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

                if (std::round((ep[1] - sp[1]) * 10000.0) == 0.0) {
                    out += 'H';
                    append_coord(out, ep[0]);
                } else if (std::round((ep[0] - sp[0]) * 10000.0) == 0.0) {
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
    svg.reserve(1024);

    svg += "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ";
    svg += std::to_string(splines.width());
    svg += ' ';
    svg += std::to_string(splines.height());
    svg += "\" width=\"";
    svg += std::to_string(splines.width());
    svg += "\" height=\"";
    svg += std::to_string(splines.height());
    svg += "\">\n<style>path{shape-rendering:geometricPrecision}</style>\n";

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
