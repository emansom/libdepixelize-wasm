#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <depixelize/depixelize.h>
#include <2geom/svg-path-writer.h>
#include <string>
#include <sstream>
#include <cstdint>
#include <iomanip>

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
        std::string d = Geom::write_svg_path(path.pathVector);
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
