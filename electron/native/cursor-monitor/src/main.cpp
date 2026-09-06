#include <windows.h>
#include <cstdio>
#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <unordered_map>

static std::atomic<bool> g_running{true};
static HHOOK g_mouseHook = NULL;

static void stdinListener() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "stop") {
            g_running.store(false);
            return;
        }
    }
    g_running.store(false);
}

// Studio 自动缩放只认 click / mouseup。旧 helper 只报 STATE（光标形状），
// 打包后 uiohook 再失败，时间轴就加不上拖放/点击缩放块。
static LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION) {
        switch (wParam) {
            case WM_LBUTTONDOWN:
                std::cout << "INTERACTION:mousedown:1" << std::endl;
                break;
            case WM_LBUTTONUP:
            case WM_RBUTTONUP:
            case WM_MBUTTONUP:
                std::cout << "INTERACTION:mouseup" << std::endl;
                break;
            case WM_RBUTTONDOWN:
                std::cout << "INTERACTION:mousedown:2" << std::endl;
                break;
            case WM_MBUTTONDOWN:
                std::cout << "INTERACTION:mousedown:3" << std::endl;
                break;
            default:
                break;
        }
    }
    return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
}

int main() {
    std::setvbuf(stdout, nullptr, _IONBF, 0);

    std::unordered_map<HCURSOR, std::string> cursorMap;
    cursorMap[LoadCursor(NULL, IDC_ARROW)]    = "arrow";
    cursorMap[LoadCursor(NULL, IDC_IBEAM)]    = "text";
    cursorMap[LoadCursor(NULL, IDC_HAND)]     = "pointer";
    cursorMap[LoadCursor(NULL, IDC_CROSS)]    = "crosshair";
    cursorMap[LoadCursor(NULL, IDC_NO)]       = "not-allowed";
    cursorMap[LoadCursor(NULL, IDC_SIZEWE)]   = "resize-ew";
    cursorMap[LoadCursor(NULL, IDC_SIZENS)]   = "resize-ns";
    cursorMap[LoadCursor(NULL, IDC_SIZEALL)]  = "open-hand";
    cursorMap[LoadCursor(NULL, IDC_WAIT)]     = "arrow";
    cursorMap[LoadCursor(NULL, IDC_APPSTARTING)] = "arrow";

    std::thread listener(stdinListener);
    listener.detach();

    g_mouseHook = SetWindowsHookExW(WH_MOUSE_LL, LowLevelMouseProc, GetModuleHandleW(NULL), 0);

    std::string lastType;

    while (g_running.load()) {
        CURSORINFO ci = {};
        ci.cbSize = sizeof(ci);

        if (GetCursorInfo(&ci) && (ci.flags & CURSOR_SHOWING)) {
            auto it = cursorMap.find(ci.hCursor);
            std::string type = (it != cursorMap.end()) ? it->second : "arrow";

            if (type != lastType) {
                lastType = type;
                std::cout << "STATE:" << type << std::endl;
            }
        }

        // 低级鼠标钩子必须在本线程泵消息，否则 INTERACTION 不会出来
        MSG msg;
        while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        Sleep(10);
    }

    if (g_mouseHook) {
        UnhookWindowsHookEx(g_mouseHook);
        g_mouseHook = NULL;
    }

    return 0;
}
