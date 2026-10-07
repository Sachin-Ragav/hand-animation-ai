# ✋ Hand Animation AI

Real-time, client-side computer vision application built with **React**, **Vite**, **HTML5 Canvas**, and **MediaPipe Hand Landmarker**. 

This project tracks 21 hand keypoints directly inside the browser using local WebAssembly (WASM), computes finger spatial geometry to determine individual extension states, and classifies hand gestures using a deterministic rule engine—all without requiring an external backend or cloud AI service.

---

## 🌟 Key Features

* **📷 Webcam Integration & Auto-Scaling:** Detects available camera devices and streams high-definition video locally with high-DPI canvas overlay positioning.
* **📍 21 Hand Landmark Tracking:** Real-time extraction of 3D joint coordinates using MediaPipe's official Hand Landmarker model.
* **🎨 Transparent Canvas Skeleton:** Real-time 2D rendering overlay featuring custom double-stroke lines and high-contrast landmark dots aligned to mirrored video feeds.
* **📐 Geometric Finger Detection:** Pure JavaScript math calculation evaluating Euclidean distances between key joints (MCP, PIP, TIP) to classify each finger as `EXTENDED` or `FOLDED` across various hand angles and depths.
* **✌️ Real-Time Gesture Recognition:** Rule-based classification engine recognizing standard gestures:
  * ✋ **OPEN HAND** (All 5 fingers extended)
  * ✊ **FIST** (All 5 fingers folded)
  * ☝️ **POINT** (Index finger extended)
  * ✌️ **PEACE** (Index & Middle fingers extended)
  * 👍 **THUMBS UP** (Thumb extended)
  * ❓ **UNKNOWN** (Non-matching hand states)
* **🔒 100% Client-Side & Private:** All frame processing runs locally in the browser via WebAssembly without sending video feeds to cloud servers.

---

## 🚀 Tech Stack

* **Frontend Framework:** React 18 + Vite
* **Computer Vision:** `@mediapipe/tasks-vision` (Hand Landmarker task & WebAssembly runtime)
* **Graphics Rendering:** HTML5 Canvas API (2D Context)
* **Styling:** CSS3 (Flexbox, CSS Grid, Responsive Design)

---

## 💻 Getting Started Locally

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (version 18 or higher) installed.

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR-USERNAME/hand-animation-ai.git](https://github.com/YOUR-USERNAME/hand-animation-ai.git)
   cd hand-animation-ai