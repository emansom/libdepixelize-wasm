#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <depixelize/depixelize.h>
#include <2geom/pathvector.h>
#include <2geom/bezier-curve.h>
#include <string>
#include <sstream>
#include <cstdint>
#include <cstdio>
#include <iomanip>

// Minimal SVG path serializer — only handles the two curve types
// libdepixelize produces (LineSegment and QuadraticBezier).
// Replaces Geom::write_svg_path() to avoid pulling in svg-path-writer.cpp,
// coord.cpp, and the double-conversion library.
static std::string path_to_svg(const Geom::PathVector& pv) {
    std::string out;
    out.reserve(256);
    char buf[64];
    auto append_point = [&](Geom::Point const& p) {
        int n = snprintf(buf, sizeof(buf), "%g,%g", p[0], p[1]);
        out.append(buf, n);
    };
    for (const auto& path : pv) {
        out += 'M';
        append_point(path.initialPoint());
        for (const auto& curve : path) {
            if (auto* line = dynamic_cast<const Geom::LineSegment*>(&curve)) {
                out += 'L';
                append_point((*line)[1]);
            } else if (auto* quad = dynamic_cast<const Geom::QuadraticBezier*>(&curve)) {
                out += 'Q';
                append_point((*quad)[1]);
                out += ' ';
                append_point((*quad)[2]);
            }
        }
        if (path.closed()) out += 'Z';
    }
    return out;
}

static std::string rgba_to_hex(const uint8_t rgba[4]) {
    std::ostringstream ss;
    ss << '#' << std::hex << std::setfill('0')
       << std::setw(2) << static_cast<int>(rgba[0])
       << std::setw(2) << static_cast<int>(rgba[1])
       << std::setw(2) << static_cast<int>(rgba[2]);
    return ss.str();
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
        default:
            splines = Depixelize::to_splines(image, options);
            break;
    }

    // Build SVG string
    std::ostringstream svg;
    svg << "<svg xmlns=\"http://www.w3.org/2000/svg\" "
        << "viewBox=\"0 0 " << splines.width() << " " << splines.height() << "\" "
        << "width=\"" << splines.width() << "\" "
        << "height=\"" << splines.height() << "\">\n";

    for (const auto& path : splines) {
        std::string d = path_to_svg(path.pathVector);
        if (d.empty()) continue;

        std::string fill = rgba_to_hex(path.rgba);
        double opacity = path.rgba[3] / 255.0;

        svg << "  <path d=\"" << d << "\" fill=\"" << fill << "\"";
        if (opacity < 1.0) {
            svg << " fill-opacity=\"" << opacity << "\"";
        }
        svg << "/>\n";
    }

    svg << "</svg>\n";
    return svg.str();
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
