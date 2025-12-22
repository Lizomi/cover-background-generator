# Dynamic Cover Background Generator

Try at: https://coverbg.lizomi.top
![preview](https://github.com/user-attachments/assets/1192d85d-24f8-471c-84ac-d6d2e67cddf6)

## Overview

This project generates dynamic, fluid-like animated backgrounds from static images, mimicking the visual style of Apple Music's player interface. It allows users to render and export these animations as high-quality MP4 videos (up to 4K resolution) directly from the browser.

## Requirements

### Browser Support
This application relies on modern Web APIs. A Chromium-based browser is highly recommended for full support.
-   **Google Chrome**: Version 94+ (Recommended)
-   **Microsoft Edge**: Version 94+
-   **Firefox**: Limited support (WebCodecs support is experimental).
-   **Safari**: Version 16.4+ (Partial support).

### Hardware
-   A discrete GPU is recommended for 4K exporting to ensure sufficient VRAM and encoding performance.
-   Integrated GPUs may experience slower export speeds or lower simultaneous rendering limits.

## Usage

1.  **Installation**:
    ```bash
    npm install
    ```

2.  **Development**:
    ```bash
    npm run dev
    ```

3.  **Build**:
    ```bash
    npm run build
    ```
