# CMake Console Application

This project is a simple console application that reads input from the standard console and prints output to the standard console.

## Project Structure

```
cmake-console-app
├── src
│   └── main.cpp
├── CMakeLists.txt
└── README.md
```

## Requirements

- CMake (version 3.10 or higher)
- A C++ compiler that supports C++11 or higher

## Building the Project

1. Open a terminal and navigate to the project directory.
2. Create a build directory:
   ```
   mkdir build
   cd build
   ```
3. Run CMake to configure the project:
   ```
   cmake ..
   ```
4. Build the project:
   ```
   cmake --build .
   ```

## Running the Application

After building the project, you can run the application with the following command:

```
./cmake-console-app
```

Follow the prompts to enter input, and the application will display the output on the console.