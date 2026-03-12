cmake_minimum_required(VERSION 3.13)
project(depixelize-wasm LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Point find_package overrides to our stubs
list(INSERT CMAKE_MODULE_PATH 0 "${CMAKE_CURRENT_SOURCE_DIR}/cmake-overrides")

# Vendor directory — defaults to in-tree, overridden by build script to use temp patched copy
if(NOT DEFINED VENDOR_DIR)
    set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor")
endif()

# --- 1. double-conversion ---
# Built for all platforms: bindings use Grisu3 (double-to-string) for exact roundtrip
# coordinate serialization. coord.cpp + svg-path-writer.cpp remain excluded from lib2geom.
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
add_subdirectory(${VENDOR_DIR}/double-conversion dc-build EXCLUDE_FROM_ALL)

# The vendored CMakeLists creates a malformed alias (double-conversion::::double-conversion).
# Create the correct alias that lib2geom expects.
if(NOT TARGET double-conversion::double-conversion)
    add_library(double-conversion::double-conversion ALIAS double-conversion)
endif()

if(EMSCRIPTEN)
    install(TARGETS double-conversion EXPORT 2geom_targets)  # satisfy lib2geom's install(EXPORT)
endif()

# --- 2. GSL (ampl/gsl fork with CMake) ---
# GSL is needed by lib2geom's basic-intersection.cpp (called via virtual methods)
set(NO_AMPL_BINDINGS ON CACHE BOOL "" FORCE)
set(GSL_DISABLE_TESTS ON CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
add_subdirectory(${VENDOR_DIR}/gsl gsl-build EXCLUDE_FROM_ALL)

# Create GSL::gsl alias that lib2geom expects
if(NOT TARGET GSL::gsl)
    add_library(GSL::gsl ALIAS gsl)
endif()

# --- 3. lib2geom ---
# Disable options that don't apply to Emscripten
set(2GEOM_TESTING OFF CACHE BOOL "" FORCE)
set(2GEOM_BUILD_SHARED OFF CACHE BOOL "" FORCE)

# Boost headers via Emscripten port — provide BoostConfig.cmake stub
# so find_package(Boost CONFIG) succeeds
if(EMSCRIPTEN)
    set(Boost_DIR "${CMAKE_CURRENT_SOURCE_DIR}/cmake-overrides" CACHE PATH "" FORCE)
endif()

add_subdirectory(${VENDOR_DIR}/lib2geom lib2geom-build EXCLUDE_FROM_ALL)

# --- 4. libdepixelize ---
# Provide 2GeomConfig.cmake stub so find_package(2Geom CONFIG) succeeds
# (lib2geom target already exists from add_subdirectory above)
set(2Geom_DIR "${CMAKE_CURRENT_SOURCE_DIR}/cmake-overrides" CACHE PATH "" FORCE)
add_subdirectory(${VENDOR_DIR}/libdepixelize libdepixelize-build EXCLUDE_FROM_ALL)

# --- 5. Shared bindings configuration ---
set(DEPIXELIZE_SOURCES bindings/depixelize_bindings.cpp)
set(DEPIXELIZE_LIBS Depixelize::depixelize 2Geom::2geom double-conversion::double-conversion)
set(DEPIXELIZE_INCLUDES
    ${VENDOR_DIR}/libdepixelize/include
    ${VENDOR_DIR}/lib2geom/include
    ${VENDOR_DIR}/double-conversion
)

# Common Emscripten link flags (shared by all WASM targets)
set(WASM_COMMON_LINK_FLAGS
    "--bind"
    "-Oz"
    "-flto"
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=createDepixelizeModule"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sINITIAL_MEMORY=16777216"
    "-sNO_EXIT_RUNTIME=1"
    "-sFILESYSTEM=0"
    "-sMALLOC=emmalloc"
    "-sDISABLE_EXCEPTION_CATCHING=1"
    "-sSUPPORT_ERRNO=0"
    "-sSUPPORT_LONGJMP=0"
    "-sDYNAMIC_EXECUTION=0"
    "-sASSERTIONS=0"
    "-sEVAL_CTORS=2"
    "-sTEXTDECODER=2"
    "-sEXPORTED_RUNTIME_METHODS=['HEAPU8']"
    "-sUSE_BOOST_HEADERS=1"
    "-sEMIT_PRODUCERS_SECTION=0"
    "--closure=1"
)
set(WASM_COMMON_COMPILE_FLAGS
    "-Oz"
    "-flto"
    "-sUSE_BOOST_HEADERS=1"
)

# --- 5a. Standard WASM build (Node/Deno — separate .js + .wasm) ---
add_executable(depixelize_wasm ${DEPIXELIZE_SOURCES})
target_link_libraries(depixelize_wasm PRIVATE ${DEPIXELIZE_LIBS})
target_include_directories(depixelize_wasm PRIVATE ${DEPIXELIZE_INCLUDES})
set_target_properties(depixelize_wasm PROPERTIES OUTPUT_NAME "depixelize" SUFFIX ".js")

if(EMSCRIPTEN)
    target_compile_options(depixelize_wasm PRIVATE ${WASM_COMMON_COMPILE_FLAGS})
    target_link_options(depixelize_wasm PRIVATE
        ${WASM_COMMON_LINK_FLAGS}
        "-sENVIRONMENT=node"
        "-sINCOMING_MODULE_JS_API=['wasmBinary','locateFile']"
    )
    # Apply shared compile flags to dependencies
    target_compile_options(2geom PRIVATE ${WASM_COMMON_COMPILE_FLAGS} "-Wno-unused-const-variable")
    target_compile_options(depixelize PRIVATE "-Oz" "-flto")
    target_compile_options(double-conversion PRIVATE "-Oz" "-flto")

    # Fix Boost.Numeric.Interval: shadow hw_rounding.hpp with WASM-compatible version
    # that forces C99 fesetround() fallback (Emscripten defines BOOST_NO_FENV_H in
    # boost/config which blocks the original C99 path)
    target_include_directories(2geom BEFORE PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/include")

    add_custom_command(TARGET depixelize_wasm POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_SOURCE_DIR}/../wasm"
        COMMAND ${CMAKE_COMMAND} -E copy
            "$<TARGET_FILE_DIR:depixelize_wasm>/depixelize.js"
            "${CMAKE_CURRENT_SOURCE_DIR}/../wasm/depixelize.js"
        COMMAND ${CMAKE_COMMAND} -E copy
            "$<TARGET_FILE_DIR:depixelize_wasm>/depixelize.wasm"
            "${CMAKE_CURRENT_SOURCE_DIR}/../wasm/depixelize.wasm"
        COMMENT "Copying standard WASM output to wasm/"
    )
endif()

# --- 5b. Browser WASM build (self-contained, WASM embedded as base64) ---
add_executable(depixelize_browser ${DEPIXELIZE_SOURCES})
target_link_libraries(depixelize_browser PRIVATE ${DEPIXELIZE_LIBS})
target_include_directories(depixelize_browser PRIVATE ${DEPIXELIZE_INCLUDES})
set_target_properties(depixelize_browser PROPERTIES OUTPUT_NAME "depixelize.browser" SUFFIX ".js")

if(EMSCRIPTEN)
    target_compile_options(depixelize_browser PRIVATE ${WASM_COMMON_COMPILE_FLAGS})
    target_link_options(depixelize_browser PRIVATE
        ${WASM_COMMON_LINK_FLAGS}
        "-sENVIRONMENT=web,worker"
        "-sSINGLE_FILE=1"
        "-sSINGLE_FILE_BINARY_ENCODE=0"
        "-sINCOMING_MODULE_JS_API=[]"
    )

    add_custom_command(TARGET depixelize_browser POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy
            "$<TARGET_FILE_DIR:depixelize_browser>/depixelize.browser.js"
            "${CMAKE_CURRENT_SOURCE_DIR}/../wasm/depixelize.browser.js"
        COMMENT "Copying browser WASM output to wasm/"
    )
endif()
