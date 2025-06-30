add_executable(example_rtia main.c $<TARGET_OBJECTS:shared>)
target_link_libraries(example_rtia PRIVATE common_lib)
