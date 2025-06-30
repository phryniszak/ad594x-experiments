add_executable(test main.c $<TARGET_OBJECTS:shared>)
target_link_libraries(test PRIVATE common_lib)
