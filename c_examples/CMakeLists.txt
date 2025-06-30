cmake_minimum_required(VERSION 3.14)
project(ad594x_examples C)

# Set the C standard (optional)
set(CMAKE_C_STANDARD 11)

include(FetchContent)
include(CMakePrintHelpers)
cmake_print_variables(CMAKE_VERSION)

add_compile_definitions(ULOG_EXTRA_OUTPUTS=1)
add_compile_definitions(common_flags INTERFACE AD5940_DEBUG)

FetchContent_Declare(
  microlog
  GIT_REPOSITORY https://github.com/an-dr/microlog.git
  GIT_TAG        v6.4.0
)

FetchContent_MakeAvailable(microlog)
cmake_print_variables(microlog_SOURCE_DIR)
cmake_print_variables(microlog_BINARY_DIR)

# Fetch the cJSON library
FetchContent_Declare(
    cjson
    GIT_REPOSITORY https://github.com/DaveGamble/cJSON.git
    GIT_TAG        master # Or a specific version, e.g., v1.7.15
)

# switch off tests
# set(ENABLE_CJSON_TEST   OFF CACHE BOOL "Disable cJSON tests" FORCE)
set(ENABLE_CJSON_TEST OFF CACHE INTERNAL "Turn off tests")
set(ENABLE_CJSON_UNINSTALL OFF CACHE INTERNAL "Turn off uninstall to avoid targets conflict")

# Make the content available
FetchContent_MakeAvailable(cjson)

# Shared include directory
include_directories(${CMAKE_SOURCE_DIR}/inc ${microlog_SOURCE_DIR}/include ${cJSON_SOURCE_DIR})

# Create shared library (object library to avoid linking manually)
add_library(shared OBJECT 
  shared/ad5940.c 
  shared/ad5940_serial.c
)

add_library(common_lib INTERFACE)
target_link_libraries(common_lib INTERFACE microlog m cjson)

# Add examples
add_subdirectory(test)
add_subdirectory(example_rtia)
add_subdirectory(example_impedance)