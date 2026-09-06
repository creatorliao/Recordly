cmake_minimum_required(VERSION 3.20)
project(cursor-monitor LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 源码含简体中文注释；未指定 UTF-8 时 MSVC 按系统代码页解析会语法错误。
if(MSVC)
	add_compile_options(/utf-8)
endif()

add_executable(cursor-monitor src/main.cpp)

target_link_libraries(cursor-monitor PRIVATE user32)
