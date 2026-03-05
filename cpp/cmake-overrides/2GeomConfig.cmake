# Stub for subdirectory builds — 2Geom::2geom target is provided by add_subdirectory(lib2geom)
if(NOT TARGET 2Geom::2geom)
    message(FATAL_ERROR "2Geom::2geom target not found. Ensure lib2geom is added via add_subdirectory() before libdepixelize.")
endif()
