# Stub FindGSL module for Emscripten builds.
# GSL is built as a subdirectory; this just validates the target exists.

if(TARGET GSL::gsl)
    set(GSL_FOUND TRUE)
else()
    set(GSL_FOUND FALSE)
    if(GSL_FIND_REQUIRED)
        message(FATAL_ERROR "GSL::gsl target not found")
    endif()
endif()
