# Stub BoostConfig.cmake for Emscripten builds.
# Boost headers are provided by Emscripten's -sUSE_BOOST_HEADERS=1 port.
# This file creates the Boost::headers target expected by lib2geom.

if(NOT TARGET Boost::headers)
    add_library(Boost::headers INTERFACE IMPORTED)
    # The Emscripten sysroot already includes boost headers when built with
    # -sUSE_BOOST_HEADERS=1, so no additional include dirs needed here.
endif()

set(Boost_FOUND TRUE)
set(Boost_VERSION "1.83.0")
set(Boost_VERSION_MAJOR 1)
set(Boost_VERSION_MINOR 83)
set(Boost_VERSION_PATCH 0)
set(Boost_INCLUDE_DIRS "")
