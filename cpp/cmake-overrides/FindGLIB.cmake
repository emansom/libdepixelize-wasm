# Stub FindGLIB module for Emscripten builds.
# Creates an empty IMPORTED target so any remaining glib references don't fail.

if(NOT TARGET PkgConfig::GLIB)
    add_library(PkgConfig::GLIB INTERFACE IMPORTED)
endif()

set(GLIB_FOUND TRUE)
