add_executable(example_impedance main.c impedance.c $<TARGET_OBJECTS:shared>)
target_link_libraries(example_impedance PRIVATE common_lib)
