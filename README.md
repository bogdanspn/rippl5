# Rippl5: Gradient Wallpaper Generator

Rippl5 is a modern web application designed to generate stunning gradient wallpapers. With an intuitive interface and powerful customization options, it allows users to create unique visuals effortlessly.

## Features

- **Preset Management**: Choose from a variety of pre-defined gradient presets or create your own.
- **Randomization**: Generate unique gradient combinations with advanced randomization logic.
- **High-Resolution Output**: Supports resolutions up to 4K (3840×2160).
- **Customizable UI**: Adjust settings like output size and gradient parameters directly from the user interface.
- **SVG Icon Integration**: Includes visually consistent SVG icons for a seamless user experience.
- **Static Hosting**: Easily run the app locally or host it on a static server.

## Technologies Used

- **HTML5**: Provides the structure and layout of the application.
- **CSS3**: Handles styling, including responsive design and SVG icon integration.
- **JavaScript (ES6)**: Implements functionality, including randomization logic, preset management, and UI interactions.

## How to Run

1. Clone or download the repository.
2. Open `index.html` in your browser directly, or serve the folder with a simple static server. Example (PowerShell):

   ```powershell
   python -m http.server 8000
   # Then open http://localhost:8000 in your browser
   ```

## Notes & Next Steps

- Modularize JavaScript further by splitting presets, shaders, and UI bindings into separate modules.
- Add a build step (e.g., esbuild or parcel) for ES module support and minification.
- Optionally extract shader sources to `.glsl` files for better management.

Rippl5 is built from scratch to provide a seamless and enjoyable experience for creating gradient wallpapers. 
Feel free to contribute or suggest improvements!


